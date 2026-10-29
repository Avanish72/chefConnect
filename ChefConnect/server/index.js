const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ---------- MongoDB models ----------
const availabilitySlotSchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // Stored as YYYY-MM-DD
    startTime: { type: String, required: true }, // Stored as HH:mm
    endTime: { type: String, required: true } // Stored as HH:mm
  },
  { _id: false }
);

const chefSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    specialty: [{ type: String, trim: true }],
    experience: { type: Number, min: 0, default: 0 },
    pricePerHour: { type: Number, min: 1, required: true },
    city: { type: String, trim: true, default: "" },
    bio: { type: String, trim: true, default: "" },
    availableSlots: { type: [availabilitySlotSchema], required: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

const bookingSchema = new mongoose.Schema(
  {
    chefId: { type: mongoose.Schema.Types.ObjectId, ref: "Chef", required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    date: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    hours: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "confirmed", "rejected", "cancelled"],
      default: "pending"
    }
  },
  { timestamps: true }
);

const Chef = mongoose.models.Chef || mongoose.model("Chef", chefSchema);
const Customer = mongoose.models.Customer || mongoose.model("Customer", customerSchema);
const Booking = mongoose.models.Booking || mongoose.model("Booking", bookingSchema);

// ---------- Validation helpers ----------
function normalizeDate(value) {
  if (typeof value !== "string") return null;
  const input = value.trim();

  // Accept standard HTML date input format: YYYY-MM-DD.
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);

  // Also accept DD-MM-YYYY, in case a browser/client sends a localized date.
  if (!match) {
    const localized = /^(\d{2})-(\d{2})-(\d{4})$/.exec(input);
    if (localized) {
      match = [localized[0], localized[3], localized[2], localized[1]];
    }
  }

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function minutes(value) {
  if (typeof value !== "string") return NaN;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeTime(value) {
  return Number.isFinite(minutes(value)) ? value.trim() : null;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function requireDatabase(_req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      message: "MongoDB is not connected. Check MONGODB_URI in your .env file and restart the server."
    });
  }
  next();
}

// ---------- Health ----------
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

// ---------- Chef routes ----------
app.get("/api/chefs", requireDatabase, async (req, res) => {
  try {
    const filter = { isActive: true };

    if (req.query.email) {
      filter.email = String(req.query.email).trim().toLowerCase();
    }

    if (req.query.search) {
      const search = escapeRegex(req.query.search.trim());
      filter.$or = [
        { name: new RegExp(search, "i") },
        { city: new RegExp(search, "i") },
        { specialty: new RegExp(search, "i") }
      ];
    }

    if (req.query.maxPrice && Number.isFinite(Number(req.query.maxPrice))) {
      filter.pricePerHour = { $lte: Number(req.query.maxPrice) };
    }

    const chefs = await Chef.find(filter).sort({ createdAt: -1 }).lean();
    res.json(chefs);
  } catch (error) {
    console.error("GET /api/chefs:", error);
    res.status(500).json({ message: "Could not load chefs." });
  }
});

app.post("/api/chefs", requireDatabase, async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      specialty,
      experience,
      pricePerHour,
      city,
      bio,
      availableSlots
    } = req.body;

    if (!name?.trim() || !email?.trim() || !phone?.trim()) {
      return res.status(400).json({
        message: "Full name, email address, and phone number are required."
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }

    const price = Number(pricePerHour);
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ message: "Hourly rate must be greater than zero." });
    }

    if (!Array.isArray(availableSlots) || availableSlots.length === 0) {
      return res.status(400).json({
        message: "Add at least one availability slot."
      });
    }

    // Normalize dates and validate the time range before saving.
    const normalizedSlots = [];
    for (const slot of availableSlots) {
      const date = normalizeDate(slot?.date);
      const startTime = normalizeTime(slot?.startTime);
      const endTime = normalizeTime(slot?.endTime);

      if (!date) {
        return res.status(400).json({
          message: `Invalid availability date "${slot?.date}". Use YYYY-MM-DD (for example, 2026-10-29).`
        });
      }

      if (!startTime || !endTime) {
        return res.status(400).json({
          message: "Invalid time. Use 24-hour format such as 10:00 or 14:00."
        });
      }

      if (minutes(startTime) >= minutes(endTime)) {
        return res.status(400).json({
          message: `Available until (${endTime}) must be later than available from (${startTime}).`
        });
      }

      normalizedSlots.push({ date, startTime, endTime });
    }

    const normalizedSpecialties = Array.isArray(specialty)
      ? specialty.map((item) => String(item).trim()).filter(Boolean)
      : String(specialty || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);

    const chef = await Chef.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      specialty: normalizedSpecialties,
      experience: Math.max(0, Number(experience) || 0),
      pricePerHour: price,
      city: String(city || "").trim(),
      bio: String(bio || "").trim(),
      availableSlots: normalizedSlots
    });

    return res.status(201).json(chef);
  } catch (error) {
    console.error("POST /api/chefs:", error);

    if (error.code === 11000) {
      return res.status(409).json({ message: "That email is already registered." });
    }

    return res.status(400).json({
      message: error.message || "Could not register chef."
    });
  }
});

// ---------- Booking routes ----------
app.post("/api/bookings", requireDatabase, async (req, res) => {
  try {
    const {
      chefId,
      customerName,
      customerEmail,
      customerPhone,
      date: rawDate,
      startTime: rawStartTime,
      endTime: rawEndTime
    } = req.body;

    if (
      !chefId ||
      !customerName?.trim() ||
      !customerEmail?.trim() ||
      !customerPhone?.trim() ||
      !rawDate ||
      !rawStartTime ||
      !rawEndTime
    ) {
      return res.status(400).json({ message: "Please complete all booking fields." });
    }

    if (!mongoose.isValidObjectId(chefId)) {
      return res.status(400).json({ message: "Invalid chef ID." });
    }

    if (!isValidEmail(customerEmail)) {
      return res.status(400).json({ message: "Please enter a valid customer email." });
    }

    const date = normalizeDate(rawDate);
    const startTime = normalizeTime(rawStartTime);
    const endTime = normalizeTime(rawEndTime);

    if (!date) {
      return res.status(400).json({ message: "Invalid booking date. Please select the date again." });
    }
    if (!startTime || !endTime || minutes(startTime) >= minutes(endTime)) {
      return res.status(400).json({ message: "End time must be later than start time." });
    }

    const chef = await Chef.findOne({ _id: chefId, isActive: true });
    if (!chef) return res.status(404).json({ message: "Chef not found." });

    const slotExists = chef.availableSlots.some((slot) => {
      const slotDate = normalizeDate(slot.date);
      return (
        slotDate === date &&
        minutes(startTime) >= minutes(slot.startTime) &&
        minutes(endTime) <= minutes(slot.endTime)
      );
    });

    if (!slotExists) {
      return res.status(409).json({
        message: "This time is outside the chef's listed availability. Choose a time shown on their profile."
      });
    }

    const existingBookings = await Booking.find({
      chefId,
      date,
      status: { $in: ["pending", "confirmed"] }
    }).lean();

    const conflict = existingBookings.some((booking) =>
      overlaps(
        minutes(startTime),
        minutes(endTime),
        minutes(booking.startTime),
        minutes(booking.endTime)
      )
    );

    if (conflict) {
      return res.status(409).json({
        message: "That slot has already been requested or booked. Please choose another time."
      });
    }

    const email = customerEmail.trim().toLowerCase();
    let customer = await Customer.findOne({ email });

    if (customer) {
      customer.name = customerName.trim();
      customer.phone = customerPhone.trim();
      await customer.save();
    } else {
      customer = await Customer.create({
        name: customerName.trim(),
        email,
        phone: customerPhone.trim()
      });
    }

    const hours = (minutes(endTime) - minutes(startTime)) / 60;
    const booking = await Booking.create({
      chefId,
      customerId: customer._id,
      date,
      startTime,
      endTime,
      hours,
      totalAmount: Math.round(hours * chef.pricePerHour),
      status: "pending"
    });

    return res.status(201).json({
      message: "Booking request saved!",
      booking
    });
  } catch (error) {
    console.error("POST /api/bookings:", error);
    return res.status(400).json({ message: error.message || "Could not create booking." });
  }
});

app.get("/api/bookings", requireDatabase, async (req, res) => {
  try {
    const filter = {};

    if (req.query.email) {
      const email = String(req.query.email).trim().toLowerCase();
      const customer = await Customer.findOne({ email });

      if (!customer) return res.json([]);
      filter.customerId = customer._id;
    }

    if (req.query.chefId) {
      if (!mongoose.isValidObjectId(req.query.chefId)) {
        return res.status(400).json({ message: "Invalid chef ID." });
      }
      filter.chefId = req.query.chefId;
    }

    const bookings = await Booking.find(filter)
      .populate("chefId", "name specialty city pricePerHour")
      .populate("customerId", "name email phone")
      .sort({ createdAt: -1 })
      .lean();

    return res.json(bookings);
  } catch (error) {
    console.error("GET /api/bookings:", error);
    res.status(500).json({ message: "Could not load bookings." });
  }
});

app.patch("/api/bookings/:id/status", requireDatabase, async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ["confirmed", "rejected", "cancelled"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Unsupported booking status." });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid booking ID." });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found." });

    if (booking.status !== "pending" && status !== "cancelled") {
      return res.status(409).json({
        message: "Only pending bookings can be confirmed or rejected."
      });
    }

    if (status === "confirmed") {
      const otherConfirmed = await Booking.find({
        _id: { $ne: booking._id },
        chefId: booking.chefId,
        date: booking.date,
        status: "confirmed"
      }).lean();

      const conflict = otherConfirmed.some((other) =>
        overlaps(
          minutes(booking.startTime),
          minutes(booking.endTime),
          minutes(other.startTime),
          minutes(other.endTime)
        )
      );

      if (conflict) {
        return res.status(409).json({
          message: "Another booking has already been confirmed for this time."
        });
      }
    }

    booking.status = status;
    await booking.save();

    return res.json({ message: `Booking ${status}.`, booking });
  } catch (error) {
    console.error("PATCH /api/bookings/:id/status:", error);
    res.status(400).json({ message: "Could not update booking status." });
  }
});

// ---------- Server startup ----------
app.use((error, _req, res, _next) => {
  console.error("Unhandled server error:", error);
  res.status(500).json({ message: "Unexpected server error." });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is missing. Add it to .env to enable database features.");
  } else {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log("Connected to MongoDB Atlas");
    } catch (error) {
      console.error("MongoDB connection failed:", error.message);
    }
  }

  app.listen(PORT, () => {
    console.log(`ChefConnect API running at http://localhost:${PORT}`);
  });
}

startServer();
