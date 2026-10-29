import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const today = new Date();
const localDate = (d) => {
  const copy = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return copy.toISOString().slice(0, 10);
};
const todayString = localDate(today);
const timeLabel = (time) => {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const money = (amount) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount || 0);

function App() {
  const [page, setPage] = useState("discover");
  const [chefs, setChefs] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [search, setSearch] = useState("");
  const [maxPrice, setMaxPrice] = useState("2000");
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedChef, setSelectedChef] = useState(null);
  const [bookingForm, setBookingForm] = useState({
    customerName: "", customerEmail: "", customerPhone: "", date: todayString, startTime: "", endTime: ""
  });
  const [bookingEmail, setBookingEmail] = useState("");
  const [chefEmail, setChefEmail] = useState("");
  const [activeChef, setActiveChef] = useState(null);
  const [chefBookings, setChefBookings] = useState([]);
  const [chefForm, setChefForm] = useState({
    name: "", email: "", phone: "", specialty: "Indian, North Indian", experience: "2",
    pricePerHour: "500", city: "", bio: "", date: todayString, slotStart: "10:00", slotEnd: "14:00"
  });

  const notify = (type, message) => {
    setNotice({ type, message });
    window.setTimeout(() => setNotice(null), 5000);
  };

  async function api(url, options = {}) {
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Something went wrong.");
    return data;
  }

  async function loadChefs() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (maxPrice) params.set("maxPrice", maxPrice);
      const data = await api(`/api/chefs?${params.toString()}`);
      setChefs(data);
    } catch (err) {
      notify("error", `${err.message} Make sure the server and MongoDB Atlas are running.`);
    } finally {
      setLoading(false);
    }
  }

  async function loadBookings(email = bookingEmail) {
    if (!email.trim()) {
      notify("error", "Enter the email used when making the booking.");
      return;
    }
    try {
      setBookings(await api(`/api/bookings?email=${encodeURIComponent(email.trim())}`));
    } catch (err) {
      notify("error", err.message);
    }
  }

  useEffect(() => { loadChefs(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setSelectedChef(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const availableSlots = useMemo(() => {
    if (!selectedChef) return [];
    return (selectedChef.availableSlots || []).filter(s => s.date >= todayString);
  }, [selectedChef]);

  async function loadChefRequests(email = chefEmail) {
    if (!email.trim()) {
      notify("error", "Enter the email address used when registering as a chef.");
      return;
    }
    try {
      const matches = await api(`/api/chefs?email=${encodeURIComponent(email.trim())}`);
      const chef = matches.find(item => item.email?.toLowerCase() === email.trim().toLowerCase());
      if (!chef) {
        setActiveChef(null);
        setChefBookings([]);
        notify("error", "No chef profile found for this email. Register as a chef first.");
        return;
      }
      setActiveChef(chef);
      setChefBookings(await api(`/api/bookings?chefId=${chef._id}`));
    } catch (err) {
      notify("error", err.message);
    }
  }

  async function updateChefBooking(id, status) {
    try {
      await api(`/api/bookings/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      notify("success", `Booking ${status}.`);
      if (activeChef) {
        setChefBookings(await api(`/api/bookings?chefId=${activeChef._id}`));
      }
    } catch (err) {
      notify("error", err.message);
    }
  }

  function startBooking(chef) {
    setSelectedChef(chef);
    const first = (chef.availableSlots || []).find(s => s.date >= todayString);
    setBookingForm(f => ({
      ...f, date: first?.date || todayString,
      startTime: first?.startTime || "", endTime: first?.endTime || ""
    }));
  }

  async function submitBooking(e) {
    e.preventDefault();
    try {
      const result = await api("/api/bookings", {
        method: "POST",
        body: JSON.stringify({ ...bookingForm, chefId: selectedChef._id })
      });
      setSelectedChef(null);
      notify("success", `${result.message} Your request is pending chef confirmation.`);
      setPage("my-bookings");
      setBookingEmail(bookingForm.customerEmail);
      await loadBookings(bookingForm.customerEmail);
    } catch (err) {
      notify("error", err.message);
    }
  }

  async function submitChef(e) {
    e.preventDefault();
    const availableSlots = [{ date: chefForm.date, startTime: chefForm.slotStart, endTime: chefForm.slotEnd }];
    try {
      await api("/api/chefs", {
        method: "POST",
        body: JSON.stringify({ ...chefForm, specialty: chefForm.specialty.split(",").map(s => s.trim()).filter(Boolean),
          experience: Number(chefForm.experience), pricePerHour: Number(chefForm.pricePerHour), availableSlots })
      });
      notify("success", "Chef registered successfully and saved to MongoDB.");
      setChefForm({ name: "", email: "", phone: "", specialty: "Indian, North Indian", experience: "2",
        pricePerHour: "500", city: "", bio: "", date: todayString, slotStart: "10:00", slotEnd: "14:00" });
      setPage("discover");
      await loadChefs();
    } catch (err) {
      notify("error", err.message);
    }
  }

  async function changeStatus(id, status) {
    try {
      await api(`/api/bookings/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      notify("success", `Booking ${status}.`);
      await loadBookings();
    } catch (err) {
      notify("error", err.message);
    }
  }

  const navItems = [
    ["discover", "Find a chef"],
    ["register", "Join as a chef"],
    ["chef-dashboard", "Chef dashboard"],
    ["my-bookings", "My bookings"]
  ];

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setPage("discover"); }}>
        <span className="brand-mark">C<span>+</span></span>
        <span>chef<span className="brand-light">connect</span><small>GOOD FOOD, YOUR WAY</small></span>
      </a>
      <nav aria-label="Main navigation">
        {navItems.map(([key, label]) => <button key={key} className={`nav-link ${page === key ? "active" : ""}`} onClick={() => setPage(key)}>{label}</button>)}
      </nav>
      <button className="top-cta" onClick={() => setPage("register")}>Become a chef <span>↗</span></button>
    </header>

    {notice && <div role="status" className={`toast ${notice.type}`}><span>{notice.type === "success" ? "✓" : "!"}</span>{notice.message}<button aria-label="Dismiss" onClick={() => setNotice(null)}>×</button></div>}

    <main>
      {page === "discover" && <>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot"></span> YOUR HOME. YOUR CHEF. YOUR MOMENT.</div>
            <h1>A great meal<br />starts with <em>the right chef.</em></h1>
            <p>Find talented local chefs for your everyday meals, family gatherings, and special occasions. Pick a time that works for you.</p>
            <div className="hero-actions">
              <button className="button button-primary" onClick={() => document.getElementById("chef-list")?.scrollIntoView({ behavior: "smooth" })}>Explore chefs <span>↓</span></button>
              <button className="button button-quiet" onClick={() => setPage("register")}>I'm a chef <span>↗</span></button>
            </div>
            <div className="hero-proof"><div className="avatar-stack"><span>R</span><span>P</span><span>A</span><span>+</span></div><div><strong>Local talent, made simple</strong><small>Book around your schedule</small></div></div>
          </div>
          <div className="hero-visual">
            <img src="https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=85" alt="Bright home kitchen prepared for cooking" />
            <div className="image-tag"><span className="tag-icon">✳</span><div><strong>Made at home</strong><small>Fresh. Personal. Delicious.</small></div></div>
            <div className="floating-note"><span>✦</span><div><strong>Your time, your table</strong><small>Flexible booking slots</small></div></div>
          </div>
        </section>

        <section className="trust-strip">
          <div><span className="trust-icon">◷</span><span><strong>Flexible hours</strong><small>Choose a time that fits</small></span></div>
          <div><span className="trust-icon">♨</span><span><strong>Different cuisines</strong><small>Find your kind of cooking</small></span></div>
          <div><span className="trust-icon">✓</span><span><strong>Simple booking</strong><small>Request in a few clicks</small></span></div>
        </section>

        <section className="chef-section" id="chef-list">
          <div className="section-heading">
            <div><div className="eyebrow">MEET YOUR NEXT FAVOURITE CHEF</div><h2>Find someone who cooks <em>your way.</em></h2></div>
            <span className="result-count">{chefs.length} {chefs.length === 1 ? "chef" : "chefs"} listed</span>
          </div>
          <form className="filter-bar" onSubmit={e => { e.preventDefault(); loadChefs(); }}>
            <label className="search-field"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, cuisine or city" aria-label="Search chefs" /></label>
            <label className="price-field"><span>Max hourly rate</span><select value={maxPrice} onChange={e => setMaxPrice(e.target.value)}><option value="500">Up to ₹500</option><option value="1000">Up to ₹1,000</option><option value="1500">Up to ₹1,500</option><option value="2000">Any price</option></select></label>
            <button className="button button-primary filter-button" type="submit">Search chefs <span>→</span></button>
          </form>

          {loading ? <div className="empty-state"><span className="loader"></span><p>Finding chefs for you…</p></div> :
            chefs.length === 0 ? <div className="empty-state">
              <div className="empty-illustration">♨</div><h3>Your next favourite chef is one step away.</h3>
              <p>No chefs match this search yet. Register a demo chef to see the booking flow in action.</p>
              <button className="button button-primary" onClick={() => setPage("register")}>Register the first chef <span>→</span></button>
            </div> :
            <div className="chef-grid">{chefs.map((chef, index) => <ChefCard key={chef._id} chef={chef} index={index} onBook={() => startBooking(chef)} />)}</div>}
        </section>
        <section className="bottom-banner"><div><span className="eyebrow">COOKING IS YOUR CRAFT?</span><h2>Good chefs deserve <em>great tables.</em></h2><p>Share your skills and let customers request the times you're available.</p></div><button className="button button-light" onClick={() => setPage("register")}>List yourself as a chef <span>↗</span></button></section>
      </>}

      {page === "register" && <section className="form-page">
        <div className="form-intro"><div className="eyebrow">FOR THE LOVE OF GOOD FOOD</div><h1>Bring your talent<br />to <em>the table.</em></h1><p>Create your chef profile, add your specialties, and tell customers when you're free to cook.</p><div className="form-tip"><span>✦</span><p><strong>A little tip</strong><br />Add a clear availability window. Customers can book any time that fits completely inside it.</p></div></div>
        <form className="panel-form" onSubmit={submitChef}>
          <div className="form-heading"><span className="form-step">01</span><div><h2>Create your chef profile</h2><p>Tell customers a little about yourself.</p></div></div>
          <div className="input-grid">
            <Field label="Full name" required><input required value={chefForm.name} onChange={e => setChefForm({...chefForm, name:e.target.value})} placeholder="e.g. Rahul Sharma" /></Field>
            <Field label="Email address" required><input required type="email" value={chefForm.email} onChange={e => setChefForm({...chefForm, email:e.target.value})} placeholder="you@example.com" /></Field>
            <Field label="Phone number" required><input required type="tel" value={chefForm.phone} onChange={e => setChefForm({...chefForm, phone:e.target.value})} placeholder="10-digit mobile number" /></Field>
            <Field label="City / service area"><input value={chefForm.city} onChange={e => setChefForm({...chefForm, city:e.target.value})} placeholder="e.g. Phagwara" /></Field>
            <Field label="Cooking specialties" hint="Separate with commas"><input value={chefForm.specialty} onChange={e => setChefForm({...chefForm, specialty:e.target.value})} placeholder="Indian, Chinese, Italian" /></Field>
            <Field label="Years of experience"><input type="number" min="0" max="60" value={chefForm.experience} onChange={e => setChefForm({...chefForm, experience:e.target.value})} /></Field>
            <Field label="Hourly rate (₹)" required><div className="input-prefix"><span>₹</span><input type="number" required min="1" value={chefForm.pricePerHour} onChange={e => setChefForm({...chefForm, pricePerHour:e.target.value})} /></div></Field>
            <Field label="Availability date" required><input type="date" required min={todayString} value={chefForm.date} onChange={e => setChefForm({...chefForm, date:e.target.value})} /></Field>
            <Field label="Available from" required><input type="time" required value={chefForm.slotStart} onChange={e => setChefForm({...chefForm, slotStart:e.target.value})} /></Field>
            <Field label="Available until" required><input type="time" required value={chefForm.slotEnd} onChange={e => setChefForm({...chefForm, slotEnd:e.target.value})} /></Field>
            <div className="field full-width"><label>Short introduction</label><textarea rows="3" value={chefForm.bio} onChange={e => setChefForm({...chefForm, bio:e.target.value})} placeholder="What do you love cooking? What can customers expect?" /></div>
          </div>
          <div className="form-footer"><span>🔒 Your details are saved to the project database.</span><button className="button button-primary" type="submit">Create chef profile <span>→</span></button></div>
        </form>
      </section>}

      {page === "chef-dashboard" && <section className="booking-page">
        <div className="eyebrow">CHEF WORKSPACE</div>
        <h1>Your next job, <em>your call.</em></h1>
        <p className="page-subtitle">Enter the email address you used to register your chef profile to view incoming booking requests.</p>
        <form className="booking-lookup" onSubmit={e => { e.preventDefault(); loadChefRequests(); }}>
          <label className="search-field"><span>✉</span><input type="email" required value={chefEmail} onChange={e => setChefEmail(e.target.value)} placeholder="Your registered chef email" /></label>
          <button className="button button-primary" type="submit">View requests <span>→</span></button>
        </form>
        {activeChef && <div className="chef-dashboard-summary">
          <div className="chef-avatar large">{initials(activeChef.name)}</div>
          <div><h2>{activeChef.name}</h2><p>{(activeChef.specialty || []).join(" · ")} · {activeChef.city || "Local service area"}</p></div>
          <span className="result-count">{chefBookings.length} request(s)</span>
        </div>}
        {!activeChef ? <div className="empty-state booking-empty"><div className="empty-illustration">♨</div><h3>Ready to review your next booking?</h3><p>Enter your registered chef email above. New customer requests will appear here.</p></div> :
          chefBookings.length === 0 ? <div className="empty-state booking-empty"><div className="empty-illustration">▤</div><h3>No booking requests yet.</h3><p>When a customer requests your services, the request will appear here.</p></div> :
          <div className="booking-list">{chefBookings.map(b => <article className="booking-row" key={b._id}>
            <div className="booking-date"><strong>{new Date(`${b.date}T12:00:00`).toLocaleDateString("en-IN", {day:"2-digit"})}</strong><span>{new Date(`${b.date}T12:00:00`).toLocaleDateString("en-IN", {month:"short"})}</span></div>
            <div className="booking-info"><h3>{b.customerId?.name || "Customer request"}</h3><p>{b.date} · {timeLabel(b.startTime)} – {timeLabel(b.endTime)}</p><small>{b.customerId?.email || ""} · {b.customerId?.phone || ""} · {b.hours} hour(s)</small></div>
            <div className="booking-end"><strong>{money(b.totalAmount)}</strong><Status status={b.status} /></div>
            {b.status === "pending" && <div className="chef-request-actions">
              <button className="button button-primary" onClick={() => updateChefBooking(b._id, "confirmed")}>Accept job ✓</button>
              <button className="button button-quiet" onClick={() => updateChefBooking(b._id, "rejected")}>Reject</button>
            </div>}
          </article>)}</div>}
        <p className="admin-note"><strong>College demo limitation:</strong> This dashboard identifies the chef by registered email, but it does not provide secure login. Add authentication before using it with real customers or deploying publicly.</p>
      </section>}

      {page === "my-bookings" && <section className="booking-page">
        <div className="eyebrow">YOUR TABLE, YOUR PLANS</div><h1>Booking <em>overview.</em></h1><p className="page-subtitle">Look up booking requests using the customer email entered at checkout.</p>
        <form className="booking-lookup" onSubmit={e => {e.preventDefault(); loadBookings();}}>
          <label className="search-field"><span>✉</span><input type="email" required value={bookingEmail} onChange={e => setBookingEmail(e.target.value)} placeholder="Enter your booking email" /></label>
          <button className="button button-primary" type="submit">Find my bookings <span>→</span></button>
        </form>
        {bookings.length === 0 ? <div className="empty-state booking-empty"><div className="empty-illustration">▤</div><h3>Your bookings will show up here.</h3><p>Enter your email above to find your booking requests, or head back to discover a chef.</p><button className="button button-quiet" onClick={() => setPage("discover")}>Browse chefs <span>→</span></button></div> :
          <div className="booking-list">{bookings.map(b => <article className="booking-row" key={b._id}>
            <div className="booking-date"><strong>{new Date(`${b.date}T12:00:00`).toLocaleDateString("en-IN", {day:"2-digit"})}</strong><span>{new Date(`${b.date}T12:00:00`).toLocaleDateString("en-IN", {month:"short"})}</span></div>
            <div className="booking-info"><h3>{b.chefId?.name || "Chef"}</h3><p>{b.date} · {timeLabel(b.startTime)} – {timeLabel(b.endTime)}</p><small>{b.chefId?.specialty?.join(" · ") || "Chef booking"} · {b.hours} hour(s)</small></div>
            <div className="booking-end"><strong>{money(b.totalAmount)}</strong><Status status={b.status} /></div>
            {b.status === "pending" && <button className="text-action" onClick={() => changeStatus(b._id, "cancelled")}>Cancel request</button>}
          </article>)}</div>}
        <p className="admin-note"><strong>College demo note:</strong> Booking confirmation is simulated through the booking status controls. In a production app, chef/admin access should be protected with authentication and role-based permissions.</p>
      </section>}
    </main>

    <footer className="footer"><a className="brand footer-brand" href="#" onClick={e => {e.preventDefault(); setPage("discover");}}><span className="brand-mark">C<span>+</span></span><span>chef<span className="brand-light">connect</span><small>GOOD FOOD, YOUR WAY</small></span></a><span>Made for good food and better moments.</span><span>College project · MongoDB powered</span></footer>

    {selectedChef && <div className="modal-backdrop" role="presentation" onMouseDown={e => {if (e.target === e.currentTarget) setSelectedChef(null);}}>
      <section className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title">
        <button className="modal-close" aria-label="Close booking form" onClick={() => setSelectedChef(null)}>×</button>
        <div className="eyebrow">LET'S MAKE IT DELICIOUS</div><h2 id="booking-title">Book <em>{selectedChef.name}</em></h2>
        <p className="modal-subtitle">Choose a time within the chef's availability. Your request will be saved as pending until confirmed.</p>
        <div className="modal-chef-summary"><span className="chef-avatar large">{initials(selectedChef.name)}</span><div><strong>{selectedChef.name}</strong><small>{(selectedChef.specialty || []).join(" · ") || "Home chef"}</small></div><b>{money(selectedChef.pricePerHour)}<small>/ hour</small></b></div>
        <div className="slot-hint"><strong>Available slots</strong>{availableSlots.length ? availableSlots.map(s => <button key={`${s.date}-${s.startTime}`} type="button" onClick={() => setBookingForm({...bookingForm, date:s.date, startTime:s.startTime, endTime:s.endTime})} className={`slot-chip ${bookingForm.date===s.date && bookingForm.startTime===s.startTime && bookingForm.endTime===s.endTime ? "selected" : ""}`}><span>{s.date}</span>{timeLabel(s.startTime)}–{timeLabel(s.endTime)}</button>) : <span>No upcoming availability is listed.</span>}</div>
        <form onSubmit={submitBooking}>
          <div className="input-grid">
            <Field label="Your full name" required><input required value={bookingForm.customerName} onChange={e => setBookingForm({...bookingForm, customerName:e.target.value})} placeholder="Your name" /></Field>
            <Field label="Email address" required><input required type="email" value={bookingForm.customerEmail} onChange={e => setBookingForm({...bookingForm, customerEmail:e.target.value})} placeholder="you@example.com" /></Field>
            <Field label="Phone number" required><input required type="tel" value={bookingForm.customerPhone} onChange={e => setBookingForm({...bookingForm, customerPhone:e.target.value})} placeholder="Your phone" /></Field>
            <Field label="Booking date" required><select required value={bookingForm.date} onChange={e => setBookingForm({...bookingForm, date:e.target.value})}><option value="">Select a date</option>{[...new Set(availableSlots.map(s => s.date))].map(d => <option key={d} value={d}>{d}</option>)}</select></Field>
            <Field label="Start time" required><input required type="time" value={bookingForm.startTime} onChange={e => setBookingForm({...bookingForm, startTime:e.target.value})} /></Field>
            <Field label="End time" required><input required type="time" value={bookingForm.endTime} onChange={e => setBookingForm({...bookingForm, endTime:e.target.value})} /></Field>
          </div>
          <div className="estimate"><span>Estimated total <small>Final amount based on selected duration</small></span><strong>{money(selectedChef.pricePerHour * Math.max(0, (parseTime(bookingForm.endTime) - parseTime(bookingForm.startTime))/60))}</strong></div>
          <button className="button button-primary submit-booking" type="submit">Request this chef <span>→</span></button>
        </form>
      </section>
    </div>}
  </div>;
}

function parseTime(time) {
  if (!time || !time.includes(":")) return 0;
  const [h,m] = time.split(":").map(Number);
  return h * 60 + m;
}
function initials(name) {
  return (name || "Chef").split(/\s+/).slice(0,2).map(s => s[0]).join("").toUpperCase();
}
function ChefCard({ chef, index, onBook }) {
  const pictures = [
    "https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1583394293214-28ded15ee548?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1574966739987-65e38c2f6ab0?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1581299894007-aaa50297cf16?auto=format&fit=crop&w=900&q=80"
  ];
  return <article className="chef-card">
    <div className="chef-photo"><img src={pictures[index % pictures.length]} alt={`${chef.name}, chef`} loading="lazy" onError={e => {e.currentTarget.style.display="none";}} /><span className="availability-pill"><span></span> Availability listed</span><span className="chef-photo-initials">{initials(chef.name)}</span></div>
    <div className="chef-card-body">
      <div className="chef-card-top"><div><h3>{chef.name}</h3><p className="chef-location">⌖ {chef.city || "Local service area"}</p></div><div className="price-tag"><strong>{money(chef.pricePerHour)}</strong><small>/ hour</small></div></div>
      <p className="chef-bio">{chef.bio || `A passionate home chef with ${chef.experience || 0} years of experience, ready to make your meals special.`}</p>
      <div className="specialty-list">{(chef.specialty || []).slice(0,3).map(s => <span key={s}>{s}</span>)}{!(chef.specialty || []).length && <span>Home cooking</span>}</div>
      <div className="chef-card-bottom"><span className="experience"><strong>{chef.experience || 0}+</strong> yrs experience</span><button className="book-link" onClick={onBook}>Book chef <span>↗</span></button></div>
      <div className="availability-preview">{(chef.availableSlots || []).slice(0,2).map(s => <span key={`${s.date}${s.startTime}`}>◷ {s.date} · {timeLabel(s.startTime)}–{timeLabel(s.endTime)}</span>)}</div>
    </div>
  </article>;
}
function Field({ label, required, hint, children }) {
  return <div className="field"><label>{label}{required && <span className="required"> *</span>}</label>{children}{hint && <small className="field-hint">{hint}</small>}</div>;
}
function Status({ status }) {
  return <span className={`status status-${status}`}>{status}</span>;
}

createRoot(document.getElementById("root")).render(<App />);
