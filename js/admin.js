

const SESSION_KEY = "admin_session";
const STATUS_KEY = "admin_order_status";   // trạng thái đơn đã cập nhật (lưu tạm)
const WEB_ORDERS_KEY = "shop_orders";      // đơn đặt từ trang thanh toán (Câu 7)
const EDIT_ROLES = ["admin", "sales"];     // vai trò được phép cập nhật trạng thái

const STATUS = {
  pending:   { label: "Chờ xác nhận", color: "#f39c12" },
  confirmed: { label: "Đã xác nhận", color: "#3498db" },
  shipping:  { label: "Đang giao", color: "#9b59b6" },
  completed: { label: "Hoàn thành", color: "#27ae60" },
  cancelled: { label: "Đã hủy", color: "#e74c3c" }
};
const ROLE_VN = { admin: "Quản trị viên", sales: "Nhân viên bán hàng", warehouse: "Nhân viên kho", accountant: "Kế toán" };
const CATEGORY_VN = { "men's clothing": "Thời trang nam", "women's clothing": "Thời trang nữ", "jewelery": "Trang sức", "electronics": "Điện tử" };

let employees = [], products = [], orders = [], currentUser = null;
const $ = id => document.getElementById(id);
const money = n => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------------- Storage an toàn ----------------
function getJSON(storage, key, fallback) {
  try { const v = storage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
function setJSON(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); } catch (e) { }
}

let toastTimer;
function toast(msg, isError) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("error", !!isError);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ==========================================================
// ĐỌC DỮ LIỆU
// ==========================================================
async function loadData() {
  const [emp, prod, xmlText] = await Promise.all([
    fetch("data/employees.json").then(r => r.json()),
    fetch("data/products.json").then(r => r.json()),
    fetch("data/carts.xml").then(r => r.text())
  ]);
  employees = emp;
  products = prod;
  orders = parseCartsXml(xmlText).concat(loadWebOrders());

  // áp dụng trạng thái đã được admin cập nhật
  const overrides = getJSON(localStorage, STATUS_KEY, {});
  orders.forEach(o => { if (overrides[o.id]) o.status = overrides[o.id]; });
  orders.sort((a, b) => b.date.localeCompare(a.date));
}

// Hóa đơn từ data/carts.xml (DOMParser)
function parseCartsXml(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  return Array.from(xml.getElementsByTagName("invoice")).map(function (inv) {
    const g = (tag, parent) => (parent || inv).getElementsByTagName(tag)[0];
    const items = Array.from(inv.getElementsByTagName("item")).map(function (it) {
      const size = g("size", it);
      return {
        productId: Number(it.getAttribute("productId")),
        sku: it.getAttribute("sku"),
        name: g("productName", it).textContent,
        color: g("color", it).textContent,
        size: size ? size.textContent : null,
        quantity: Number(g("quantity", it).textContent),
        unitPrice: Number(g("unitPrice", it).textContent),
        discount: Number(g("discount", it).textContent),
        lineTotal: Number(g("lineTotal", it).textContent)
      };
    });
    return {
      id: inv.getAttribute("id"),
      source: "carts.xml",
      date: g("orderDate").textContent,
      status: inv.getAttribute("status"),
      employee: { id: g("employee").getAttribute("id"), name: g("employee").textContent },
      customer: {
        id: g("customer").getAttribute("id"),
        name: g("customer").textContent,
        phone: g("phone").textContent,
        address: g("address").textContent
      },
      payment: g("payment").getAttribute("method"),
      paid: g("payment").getAttribute("paid") === "true",
      items: items,
      subtotal: Number(g("subTotal").textContent),
      shipping: Number(g("shippingFee").textContent),
      total: Number(g("total").textContent)
    };
  });
}

// Đổi thời gian ISO (UTC) sang giờ địa phương dạng YYYY-MM-DDTHH:mm:ss
function localDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

// Đơn đặt trên website (Câu 7 lưu trong localStorage)
function loadWebOrders() {
  return getJSON(localStorage, WEB_ORDERS_KEY, []).map(function (o) {
    return {
      id: o.id,
      source: "website",
      date: localDate(o.createdAt),
      status: "pending",
      employee: { id: "WEB", name: "Website" },
      customer: { id: "", name: o.customer.fullName, phone: o.customer.phone, address: o.customer.address, email: o.customer.email },
      payment: o.payment,
      paid: o.status === "paid" && o.payment !== "COD",
      items: o.items.map(i => ({
        productId: i.productId, sku: "", name: i.title, color: i.color, size: i.size,
        quantity: i.quantity, unitPrice: i.price, discount: 0, lineTotal: Math.round(i.price * i.quantity * 100) / 100
      })),
      subtotal: o.subtotal, shipping: o.shipping, total: o.total
    };
  });
}

// ==========================================================
// ĐĂNG NHẬP
// ==========================================================
const loginForm = $("loginForm");
let failCount = 0;

function fieldError(input, msg) {
  input.classList.toggle("is-invalid", !!msg);
  $(input.id + "Msg").textContent = msg || "";
  return !msg;
}
function checkLoginField(input) {
  const v = input.value.trim();
  if (!v) return fieldError(input, "Vui lòng nhập " + (input.name === "username" ? "tên đăng nhập." : "mật khẩu."));
  if (v.length < input.minLength) return fieldError(input, "Cần ít nhất " + input.minLength + " ký tự.");
  return fieldError(input, "");
}
["loginUser", "loginPass"].forEach(function (id) {
  $(id).addEventListener("blur", () => checkLoginField($(id)));
  $(id).addEventListener("input", () => { if ($(id).classList.contains("is-invalid")) checkLoginField($(id)); });
});
$("togglePass").addEventListener("click", function () {
  const p = $("loginPass");
  p.type = p.type === "password" ? "text" : "password";
});

loginForm.addEventListener("submit", function (e) {
  e.preventDefault();
  const okU = checkLoginField($("loginUser"));
  const okP = checkLoginField($("loginPass"));
  if (!okU || !okP) return;

  const username = $("loginUser").value.trim();
  const password = $("loginPass").value;
  const emp = employees.find(x => x.account.username === username);

  let error = "";
  if (!emp || emp.account.password !== password) error = "Sai tên đăng nhập hoặc mật khẩu.";
  else if (emp.status !== "active") error = "Tài khoản đã ngừng hoạt động. Vui lòng liên hệ quản trị viên.";
  else if (!emp.permissions.includes("dashboard")) error = "Tài khoản không có quyền truy cập trang quản trị.";

  if (error) {
    failCount++;
    $("loginError").textContent = error + (failCount >= 3 ? " (Sai " + failCount + " lần)" : "");
    if (failCount >= 5) lockLogin();
    return;
  }

  failCount = 0;
  const session = { id: emp.id, username: emp.account.username, fullName: emp.fullName, role: emp.role, loginAt: new Date().toISOString() };
  // Ghi nhớ đăng nhập: localStorage; không ghi nhớ: sessionStorage (mất khi đóng trình duyệt)
  if ($("remember").checked) setJSON(localStorage, SESSION_KEY, session);
  else setJSON(sessionStorage, SESSION_KEY, session);
  loginForm.reset();
  $("loginError").textContent = "";
  startAdmin(session);
});

function lockLogin() {
  const btn = loginForm.querySelector("button[type=submit]");
  btn.disabled = true;
  let s = 30;
  const timer = setInterval(function () {
    btn.textContent = "Thử lại sau " + s-- + " giây";
    if (s < 0) { clearInterval(timer); btn.disabled = false; btn.textContent = "Đăng nhập"; failCount = 0; }
  }, 1000);
}

function getSession() {
  const s = getJSON(sessionStorage, SESSION_KEY, null) || getJSON(localStorage, SESSION_KEY, null);
  if (!s) return null;
  const emp = employees.find(x => x.id === s.id && x.status === "active");
  return emp ? s : null;
}

$("btnLogout").addEventListener("click", function () {
  try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch (e) { }
  currentUser = null;
  $("adminApp").hidden = true;
  $("loginScreen").hidden = false;
  location.hash = "";
  toast("Đã đăng xuất.");
});

// ==========================================================
// GIAO DIỆN ADMIN
// ==========================================================
function startAdmin(session) {
  currentUser = session;
  $("loginScreen").hidden = true;
  $("adminApp").hidden = false;
  $("userName").textContent = session.fullName;
  $("userRole").textContent = ROLE_VN[session.role] || session.role;
  $("userAvatar").textContent = session.fullName.split(" ").pop().charAt(0);
  renderAll();
  showView(location.hash.slice(1) || "dashboard");
}

const TITLES = { dashboard: "Tổng quan", orders: "Quản lý đơn hàng", products: "Sản phẩm bán ra" };
function showView(name) {
  if (!TITLES[name]) name = "dashboard";
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("show", v.id === "view-" + name));
  document.querySelectorAll("#adminMenu a").forEach(a => a.classList.toggle("active", a.dataset.view === name));
  $("viewTitle").textContent = TITLES[name];
  history.replaceState(null, "", "#" + name);
}
$("adminMenu").addEventListener("click", function (e) {
  const a = e.target.closest("a[data-view]");
  if (!a) return;
  e.preventDefault();
  showView(a.dataset.view);
});

function renderAll() {
  renderDashboard();
  renderOrders();
  renderProductStats();
}

const activeOrders = () => orders.filter(o => o.status !== "cancelled");

// Gộp số lượng bán theo sản phẩm
function productStats() {
  const map = {};
  activeOrders().forEach(function (o) {
    o.items.forEach(function (i) {
      if (!map[i.productId]) map[i.productId] = { productId: i.productId, name: i.name, quantity: 0, revenue: 0, orders: new Set() };
      map[i.productId].quantity += i.quantity;
      map[i.productId].revenue += i.lineTotal;
      map[i.productId].orders.add(o.id);
    });
  });
  return Object.values(map).map(function (s) {
    const p = products.find(x => x.id === s.productId) || {};
    return { ...s, orders: s.orders.size, sku: p.sku || "", category: p.category || "", stock: p.stock ?? "", title: p.title || s.name };
  }).sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
}

// ---------------- Tổng quan ----------------
function renderDashboard() {
  const act = activeOrders();
  const revenue = act.reduce((s, o) => s + o.total, 0);
  const sold = act.reduce((s, o) => s + o.items.reduce((n, i) => n + i.quantity, 0), 0);
  const web = orders.filter(o => o.source === "website").length;
  const stats = productStats();

  $("kpiOrders").textContent = orders.length;
  $("kpiOrdersSub").textContent = (orders.length - web) + " hóa đơn + " + web + " đơn website";
  $("kpiRevenue").textContent = money(revenue);
  $("kpiSold").textContent = sold;
  $("kpiSoldSub").textContent = stats.length + " mã sản phẩm khác nhau";
  $("kpiPending").textContent = orders.filter(o => o.status === "pending").length;

  // Doanh thu theo ngày
  const byDay = {};
  act.forEach(o => { const d = o.date.slice(0, 10); byDay[d] = (byDay[d] || 0) + o.total; });
  const days = Object.keys(byDay).sort();
  const max = Math.max(1, ...Object.values(byDay));
  const chart = $("revenueChart");
  chart.innerHTML = "";
  days.forEach(function (d, i) {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.title = d + ": " + money(byDay[d]);
    bar.innerHTML = '<span class="bar-value">$' + Math.round(byDay[d]) + "</span>" +
      '<div class="bar-fill" style="height:' + (byDay[d] / max * 75) + '%;animation-delay:' + i * 50 + 'ms"></div>' +
      '<span class="bar-label">' + d.slice(8, 10) + "/" + d.slice(5, 7) + "</span>";
    chart.appendChild(bar);
  });
  if (!days.length) chart.innerHTML = '<p class="muted">Chưa có dữ liệu.</p>';

  // Biểu đồ tròn trạng thái
  const counts = {};
  Object.keys(STATUS).forEach(k => counts[k] = 0);
  orders.forEach(o => counts[o.status] = (counts[o.status] || 0) + 1);
  let acc = 0;
  const stops = Object.keys(STATUS).map(function (k) {
    const from = acc / orders.length * 360;
    acc += counts[k];
    return STATUS[k].color + " " + from + "deg " + (acc / orders.length * 360) + "deg";
  });
  $("statusDonut").style.background = orders.length ? "conic-gradient(" + stops.join(",") + ")" : "#ecf0f1";
  $("donutCenter").textContent = orders.length;
  $("statusLegend").innerHTML = Object.keys(STATUS).map(k =>
    '<li><i style="background:' + STATUS[k].color + '"></i>' + STATUS[k].label + ": <strong>" + counts[k] + "</strong></li>").join("");

  // Top 5 sản phẩm
  const top = stats.slice(0, 5);
  const topMax = top.length ? top[0].quantity : 1;
  const ol = $("topProducts");
  ol.innerHTML = "";
  top.forEach(function (s) {
    const li = document.createElement("li");
    const row = document.createElement("div");
    row.className = "top-row";
    const name = document.createElement("span");
    name.textContent = s.title;
    name.title = s.title;
    const q = document.createElement("strong");
    q.textContent = s.quantity + " sp · " + money(s.revenue);
    row.append(name, q);
    const bar = document.createElement("div");
    bar.className = "top-bar";
    bar.innerHTML = '<div style="width:' + (s.quantity / topMax * 100) + '%"></div>';
    li.append(row, bar);
    ol.appendChild(li);
  });

  // Doanh số theo nhân viên
  const staff = {};
  act.forEach(function (o) {
    const k = o.employee.id;
    if (!staff[k]) staff[k] = { name: o.employee.name, count: 0, revenue: 0 };
    staff[k].count++;
    staff[k].revenue += o.total;
  });
  $("staffTable").innerHTML = Object.entries(staff).sort((a, b) => b[1].revenue - a[1].revenue).map(([id, s]) =>
    "<tr><td>" + id + " - " + escapeHtml(s.name) + "</td><td>" + s.count + '</td><td class="num">' + money(s.revenue) + "</td></tr>").join("");
}

// ---------------- Quản lý đơn hàng ----------------
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function statusBadge(st) {
  return '<span class="status ' + st + '">' + (STATUS[st] ? STATUS[st].label : st) + "</span>";
}

function renderOrders() {
  const kw = $("orderSearch").value.trim().toLowerCase();
  const st = $("orderStatus").value;
  const src = $("orderSource").value;
  const list = orders.filter(function (o) {
    if (st !== "all" && o.status !== st) return false;
    if (src !== "all" && o.source !== src) return false;
    if (kw) {
      const text = (o.id + " " + o.customer.name + " " + o.customer.phone + " " + o.customer.id).toLowerCase();
      if (!text.includes(kw)) return false;
    }
    return true;
  });
  $("orderCount").textContent = list.length + " / " + orders.length + " đơn";
  $("orderTable").innerHTML = list.length ? list.map(o =>
    "<tr>" +
      "<td><strong>" + escapeHtml(o.id) + "</strong>" + (o.source === "website" ? '<span class="tag web">Web</span>' : '<span class="tag">XML</span>') + "</td>" +
      "<td>" + escapeHtml(o.date.replace("T", " ").slice(0, 16)) + "</td>" +
      "<td>" + escapeHtml(o.customer.name) + "<br><small class=\"muted\">" + escapeHtml(o.customer.phone) + "</small></td>" +
      "<td>" + escapeHtml(o.employee.name) + "</td>" +
      "<td>" + o.items.reduce((n, i) => n + i.quantity, 0) + "</td>" +
      '<td class="num"><strong>' + money(o.total) + "</strong></td>" +
      "<td>" + escapeHtml(o.payment) + (o.paid ? ' <span class="tag web">Đã trả</span>' : "") + "</td>" +
      "<td>" + statusBadge(o.status) + "</td>" +
      '<td><button type="button" class="btn btn-light btn-sm" data-order="' + escapeHtml(o.id) + '">Xem</button></td>' +
    "</tr>").join("") : '<tr><td colspan="9" class="muted">Không có đơn hàng phù hợp.</td></tr>';
}
["orderSearch", "orderStatus", "orderSource"].forEach(id => $(id).addEventListener("input", renderOrders));
$("orderFilter").addEventListener("submit", e => e.preventDefault());

// Event Delegation cho nút "Xem" trong bảng đơn hàng
$("orderTable").addEventListener("click", function (e) {
  const btn = e.target.closest("[data-order]");
  if (btn) openOrder(btn.dataset.order);
});

let openedOrder = null;
function openOrder(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  openedOrder = o;
  $("odTitle").textContent = "Đơn hàng " + o.id;
  $("odInfo").innerHTML =
    "<p><strong>Khách hàng:</strong> " + escapeHtml(o.customer.name) + (o.customer.id ? " (" + escapeHtml(o.customer.id) + ")" : "") + "</p>" +
    "<p><strong>Ngày đặt:</strong> " + escapeHtml(o.date.replace("T", " ")) + "</p>" +
    "<p><strong>SĐT:</strong> " + escapeHtml(o.customer.phone) + "</p>" +
    "<p><strong>Nhân viên:</strong> " + escapeHtml(o.employee.name) + "</p>" +
    "<p><strong>Địa chỉ:</strong> " + escapeHtml(o.customer.address) + "</p>" +
    "<p><strong>Thanh toán:</strong> " + escapeHtml(o.payment) + (o.paid ? " - đã thanh toán" : " - chưa thanh toán") + "</p>" +
    "<p><strong>Trạng thái:</strong> " + statusBadge(o.status) + "</p>" +
    "<p><strong>Nguồn:</strong> " + (o.source === "website" ? "Đặt trên website" : "Hóa đơn carts.xml") + "</p>";
  $("odItems").innerHTML = o.items.map(i =>
    '<tr><td class="wrap">' + escapeHtml(i.name) + "</td><td>" + escapeHtml(i.color) + (i.size ? " / " + escapeHtml(i.size) : "") +
    "</td><td>" + i.quantity + '</td><td class="num">' + money(i.unitPrice) + (i.discount ? " <small>-" + i.discount + "%</small>" : "") +
    '</td><td class="num">' + money(i.lineTotal) + "</td></tr>").join("");
  $("odTotal").innerHTML = "<dt>Tạm tính</dt><dd>" + money(o.subtotal) + "</dd><dt>Phí vận chuyển</dt><dd>" + money(o.shipping) +
    '</dd><dt class="grand">Tổng cộng</dt><dd class="grand">' + money(o.total) + "</dd>";

  const canEdit = EDIT_ROLES.includes(currentUser.role);
  $("odStatus").value = o.status;
  $("odStatus").disabled = !canEdit;
  $("odSave").disabled = !canEdit;
  $("odMsg").textContent = canEdit ? "" : "Vai trò " + (ROLE_VN[currentUser.role] || currentUser.role) + " chỉ được xem, không được cập nhật trạng thái.";
  $("orderDialog").showModal();
}

$("odSave").addEventListener("click", function () {
  if (!openedOrder || !EDIT_ROLES.includes(currentUser.role)) return;
  const st = $("odStatus").value;
  openedOrder.status = st;
  const overrides = getJSON(localStorage, STATUS_KEY, {});
  overrides[openedOrder.id] = st;
  setJSON(localStorage, STATUS_KEY, overrides);   // lưu tạm vào localStorage
  $("orderDialog").close();
  renderAll();
  toast("Đã cập nhật đơn " + openedOrder.id + " → " + STATUS[st].label);
});

document.querySelectorAll("dialog").forEach(d => d.addEventListener("click", function (e) {
  if (e.target === d || e.target.closest("[data-close]")) d.close();
}));

// ---------------- Sản phẩm bán ra ----------------
function renderProductStats() {
  const kw = $("productSearch").value.trim().toLowerCase();
  const list = productStats().filter(s => !kw || (s.title + " " + s.sku).toLowerCase().includes(kw));
  $("productTable").innerHTML = list.length ? list.map((s, i) =>
    "<tr><td>" + (i + 1) + "</td><td>" + escapeHtml(s.sku) + '</td><td class="wrap">' + escapeHtml(s.title) + "</td><td>" +
    escapeHtml(CATEGORY_VN[s.category] || s.category) + "</td><td><strong>" + s.quantity + '</strong></td><td class="num">' +
    money(s.revenue) + "</td><td>" + s.orders + "</td><td>" + s.stock + "</td></tr>").join("")
    : '<tr><td colspan="8" class="muted">Không có dữ liệu.</td></tr>';
}
$("productSearch").addEventListener("input", renderProductStats);

// ==========================================================
// KHỞI ĐỘNG
// ==========================================================
(async function init() {
  try {
    await loadData();
  } catch (err) {
    $("loginError").textContent = "Không đọc được dữ liệu trong thư mục data/. Hãy mở bằng Live Server.";
    return;
  }
  const session = getSession();
  if (session) startAdmin(session);   // đã đăng nhập trước đó
})();
