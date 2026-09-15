/* ============================================================
   tripreviewall.com — Transportation page logic
   Fleet/rate data below is ILLUSTRATIVE placeholder content —
   replace with the real partner's fleet sheet before launch.
   ============================================================ */

const FLEET = [
  { type: "Sedan", name: "Executive Sedan", seats: 3, feature: "Leather interior", luggage: "2 large bags", rate: 65 },
  { type: "SUV", name: "Premium SUV", seats: 5, feature: "Extra legroom", luggage: "4 large bags", rate: 95 },
  { type: "Van", name: "Passenger Van", seats: 10, feature: "Group-friendly", luggage: "8 large bags", rate: 135 },
  { type: "Sprinter Van", name: "Sprinter Van", seats: 14, feature: "Standing room", luggage: "10 large bags", rate: 175 },
  { type: "Limousine", name: "Stretch Limousine", seats: 8, feature: "Wedding-ready", luggage: "4 large bags", rate: 150 },
  { type: "Minibus", name: "Minibus", seats: 20, feature: "Large group tours", luggage: "16 large bags", rate: 225 }
];

const FLEET_CATEGORIES = ["All", "Sedan", "SUV", "Van", "Sprinter Van", "Limousine", "Minibus"];
let tpFleetFilter = "All";

document.addEventListener("DOMContentLoaded", () => {
  renderFleetTabs();
  renderFleetGrid();
  renderRateTable();
  renderFaq();
  initForm();
  renderRelatedArticles();
});

function renderFleetTabs() {
  document.getElementById("fleet-tabs").innerHTML = FLEET_CATEGORIES.map((c) =>
    `<button class="tp-fleet-tab${c === tpFleetFilter ? " active" : ""}" data-cat="${c}">${c}</button>`).join("");
  document.querySelectorAll(".tp-fleet-tab").forEach((btn) => {
    btn.addEventListener("click", () => { tpFleetFilter = btn.dataset.cat; renderFleetTabs(); renderFleetGrid(); });
  });
}

function renderFleetGrid() {
  const list = tpFleetFilter === "All" ? FLEET : FLEET.filter((v) => v.type === tpFleetFilter);
  document.getElementById("fleet-grid").innerHTML = list.map((v) => `
    <div class="tp-fleet-card">
      <div class="tp-fleet-img tour-photo" style="background:linear-gradient(135deg,#26313A,#0B3B4F);"></div>
      <div class="tp-fleet-body">
        <h3 class="tp-fleet-name">${v.name}</h3>
        <ul class="tp-fleet-specs">
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${v.seats} passengers</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${v.feature}</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${v.luggage}</li>
        </ul>
        <div class="tp-fleet-footer">
          <span class="tp-fleet-price">$${v.rate}<span style="font-size:12px;font-weight:400;color:var(--color-text-muted);"> /hour</span></span>
          <a href="#tp-form" class="btn btn-secondary" style="padding:8px 16px;font-size:var(--text-meta);">Check Rates</a>
        </div>
      </div>
    </div>`).join("");
}

function renderRateTable() {
  document.getElementById("rate-table-body").innerHTML = FLEET.map((v) => `
    <tr>
      <td>${v.name}</td>
      <td>${v.seats}</td>
      <td class="num">$${v.rate}/hr</td>
      <td>2 hours</td>
      <td><a href="#tp-form">Request this vehicle →</a></td>
    </tr>`).join("");
}

const TP_FAQ = [
  { q: "How far in advance should I book?", a: "We recommend at least 48 hours' notice, and 2+ weeks for weddings or large groups." },
  { q: "Can this operator handle group airport transfers?", a: "Yes — vans and minibuses are available for groups arriving on the same flight." },
  { q: "What's included in the hourly rate?", a: "Driver, vehicle and standard mileage within Oahu. Confirm any island-wide surcharges directly with the operator." },
  { q: "Is there a cancellation policy?", a: "Confirm current policy directly — typically free cancellation with 24–48 hours' notice." },
  { q: "Do you serve the whole island or specific areas?", a: "Island-wide, though pickup times outside the primary service radius may vary." },
  { q: "What happens after I submit the quote form?", a: "The operator's team reviews your request and follows up directly with pricing and availability — this is not an instant booking." }
];

function renderFaq() {
  document.getElementById("tp-faq-list").innerHTML = TP_FAQ.map((f, i) => `
    <div class="faq-item" data-idx="${i}">
      <button class="faq-question">${f.q}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>
      <div class="faq-answer">${f.a}</div>
    </div>`).join("");
  document.querySelectorAll(".faq-question").forEach((btn) => {
    btn.addEventListener("click", () => btn.closest(".faq-item").classList.toggle("open"));
  });
}

function initForm() {
  document.getElementById("tp-inquiry-form").addEventListener("submit", function (e) {
    e.preventDefault();
    /* Static prototype: no backend wired yet. In production this posts to
       /api/leads (source_type: "transportation") per master-technical-architecture.md §8. */
    this.style.display = "none";
    document.getElementById("tp-form-success").style.display = "block";
  });
}

function renderRelatedArticles() {
  const el = document.getElementById("tp-related-articles");
  if (typeof BLOG_POSTS === "undefined") return;
  const list = BLOG_POSTS.slice(0, 3);
  el.innerHTML = list.map((p) => `
    <a href="${p.hasDetailPage ? "blog/" + p.slug + ".html" : "#"}" class="blog-card">
      <div class="blog-card-image" style="background:linear-gradient(135deg,#0B3B4F,#5C8A72);"></div>
      <div class="blog-card-body">
        <div class="blog-card-cat">${p.category}</div>
        <h3 class="blog-card-title">${p.title}</h3>
        <div class="blog-card-meta">${p.updatedAt} · ${p.readTime} min read</div>
      </div>
    </a>`).join("");
}
