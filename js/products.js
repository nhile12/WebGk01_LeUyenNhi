// ==========================================================
// 
// ==========================================================

const DATA_URL = "data/products.json";
const LS_FILTER = "shop_filter";   // lưu tạm bộ lọc người dùng
const SKELETON_COUNT = 8;
const MIN_LOADING_MS = 1200;       // giữ skeleton tối thiểu 1.2s để thấy hiệu ứng

const CATEGORY_VN = {
  "men's clothing": "Thời trang nam",
  "women's clothing": "Thời trang nữ",
  "jewelery": "Trang sức",
  "electronics": "Điện tử"
};

const grid = document.getElementById("productGrid");
const form = document.getElementById("searchForm");
const resultInfo = document.getElementById("resultInfo");
const formError = document.getElementById("formError");
const priceMin = document.getElementById("priceMin");
const priceMax = document.getElementById("priceMax");
const priceRange = document.getElementById("priceRange");
const priceRangeOut = document.getElementById("priceRangeOut");

let allProducts = [];

// ---------------- localStorage (an toàn khi trình duyệt chặn) ----------------
function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { }
}
function lsRemove(key) {
  try { localStorage.removeItem(key); } catch (e) { }
}

// ---------------- Skeleton Loading (Câu 3) ----------------
function showSkeleton(n) {
  grid.innerHTML = "";
  grid.setAttribute("aria-busy", "true");
  for (let i = 0; i < n; i++) {
    const art = document.createElement("article");
    art.className = "product-card skeleton-card";
    art.setAttribute("aria-hidden", "true");
    art.innerHTML =
      '<div class="skeleton skeleton-img"></div>' +
      '<div class="product-body">' +
        '<div class="skeleton skeleton-line w-40"></div>' +
        '<div class="skeleton skeleton-line w-90"></div>' +
        '<div class="skeleton skeleton-line w-60"></div>' +
        '<div class="skeleton skeleton-line lg w-40"></div>' +
        '<div class="skeleton skeleton-btn"></div>' +
      '</div>';
    grid.appendChild(art);
  }
}

// ---------------- Hiển thị sản phẩm ----------------
function stars(rate) {
  const full = Math.round(rate);
  return "★".repeat(full) + "☆".repeat(5 - full);
}

function colorStock(p, colorName) {
  const c = p.colors.find(x => x.name === colorName);
  return c ? c.stock : p.stock;
}

function makeChip(action, attr, value, label, hex, active) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip" + (active ? " active" : "");
  b.dataset.action = action;
  b.dataset[attr] = value;
  b.setAttribute("aria-pressed", active ? "true" : "false");
  b.title = label;
  if (hex) {
    b.classList.add("chip-color");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = hex;
    b.appendChild(dot);
    b.setAttribute("aria-label", label);
  } else {
    b.textContent = label;
  }
  return b;
}

function renderProducts(list) {
  grid.innerHTML = "";
  grid.setAttribute("aria-busy", "false");

  if (list.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = "Không tìm thấy sản phẩm phù hợp. Hãy thử thay đổi điều kiện tìm kiếm.";
    grid.appendChild(p);
    resultInfo.textContent = "0 sản phẩm";
    return;
  }

  const tpl = document.getElementById("productTemplate");
  list.forEach(function (p, i) {
    const node = tpl.content.cloneNode(true);
    const art = node.querySelector("article");
    art.classList.add("fade-in");
    art.style.animationDelay = (i * 40) + "ms";

    // data-id + data-variant (biến thể mặc định: màu đầu tiên, size đầu tiên)
    const variant = { color: p.colors[0].name, size: p.sizes[0] || null };
    art.dataset.id = p.id;
    art.dataset.variant = JSON.stringify(variant);

    const img = node.querySelector("img");
    img.src = p.image;
    img.alt = p.title;
    node.querySelector(".badge").textContent = p.discount > 0 ? "-" + p.discount + "%" : "";
    node.querySelector(".product-category").textContent = CATEGORY_VN[p.category] || p.category;
    node.querySelector(".product-title").textContent = p.title;
    node.querySelector(".product-title").title = p.title;
    node.querySelector(".product-rating").innerHTML =
      '<span class="stars">' + stars(p.rating.rate) + "</span> " + p.rating.rate + " (" + p.rating.count + ")";

    // Chọn màu (nút) - không gắn listener riêng, dùng Event Delegation
    const colorBox = node.querySelector(".variant-colors");
    p.colors.forEach(function (c) {
      colorBox.appendChild(makeChip("select-color", "color", c.name, c.name, c.hex, c.name === variant.color));
    });
    // Chọn size
    const sizeBox = node.querySelector(".variant-sizes");
    if (p.sizes.length) {
      p.sizes.forEach(function (s) {
        sizeBox.appendChild(makeChip("select-size", "size", s, s, null, s === variant.size));
      });
    } else {
      node.querySelector(".variant-size-group").remove();
    }

    node.querySelector(".sale").textContent = "$" + p.salePrice.toFixed(2);
    node.querySelector(".old").textContent = p.discount > 0 ? "$" + p.price.toFixed(2) : "";
    node.querySelector(".product-stock").textContent =
      "Màu " + variant.color + ": còn " + colorStock(p, variant.color) + " | Đã bán: " + p.sold;

    grid.appendChild(node);
  });

  // Câu 5: chèn <span> số sao trung bình từ reviews.xml lên ảnh
  Reviews.renderBadges(grid);
  resultInfo.textContent = "Hiển thị " + list.length + " / " + allProducts.length + " sản phẩm";
}

// ==========================================================
// Câu 4: EVENT DELEGATION
// Chỉ gắn DUY NHẤT 1 listener lên container cha #productGrid.
// Mọi nút trong thẻ sản phẩm (Thêm vào giỏ, Xem nhanh, chọn màu/size,
// Rating Detail) đều được xử lý ở đây nhờ cơ chế nổi bọt (bubbling).
// ==========================================================
const eventLog = document.getElementById("eventLog");

grid.addEventListener("click", function (e) {
  const btn = e.target.closest("[data-action]");
  if (!btn || !grid.contains(btn)) return;

  const card = btn.closest("article[data-id]");
  if (!card) return;

  // Trích xuất data-id và data-variant của sản phẩm tương ứng
  const id = Number(card.dataset.id);
  const variant = JSON.parse(card.dataset.variant || "{}");
  const product = allProducts.find(p => p.id === id);
  if (!product) return;

  const action = btn.dataset.action;

  switch (action) {
    case "select-color":
      variant.color = btn.dataset.color;
      updateVariant(card, variant, ".variant-colors", btn);
      card.querySelector(".product-stock").textContent =
        "Màu " + variant.color + ": còn " + colorStock(product, variant.color) + " | Đã bán: " + product.sold;
      break;

    case "select-size":
      variant.size = btn.dataset.size;
      updateVariant(card, variant, ".variant-sizes", btn);
      break;

    case "add-to-cart": {
      const r = Cart.add(product, variant, 1);       // Câu 6
      showToast(r.ok ? (r.isNew ? "Đã thêm vào giỏ: " : "Đã tăng số lượng: ") + product.title.slice(0, 30) : r.msg, !r.ok);
      if (r.ok) Cart.open();
      break;
    }

    case "quick-view":
      showQuickView(product, variant);
      break;

    case "rating-detail":
      Reviews.showDetail(product);                    // Câu 5
      break;
  }

  const info = "action=" + action + " | data-id=" + id + " | data-variant=" + card.dataset.variant;
  eventLog.value = info;
  console.log("[Event Delegation]", { action: action, id: id, variant: JSON.parse(card.dataset.variant) });
});

function updateVariant(card, variant, boxSelector, activeBtn) {
  card.dataset.variant = JSON.stringify(variant);
  card.querySelectorAll(boxSelector + " .chip").forEach(function (c) {
    const on = c === activeBtn;
    c.classList.toggle("active", on);
    c.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

// ---------------- Xem nhanh ----------------
function showQuickView(p, variant) {
  const dlg = document.getElementById("quickViewDialog");
  document.getElementById("qvImage").src = p.image;
  document.getElementById("qvImage").alt = p.title;
  document.getElementById("qvCategory").textContent = CATEGORY_VN[p.category] || p.category;
  document.getElementById("qvTitle").textContent = p.title;
  const s = Reviews.get(p.id);
  document.getElementById("qvRating").innerHTML =
    '<span class="stars">' + stars(s ? s.avg : p.rating.rate) + "</span> " +
    (s ? s.avg.toFixed(1) + " (" + s.count + " đánh giá của khách hàng)" : "Chưa có đánh giá");
  document.getElementById("qvSale").textContent = "$" + p.salePrice.toFixed(2);
  document.getElementById("qvOld").textContent = p.discount > 0 ? "$" + p.price.toFixed(2) : "";
  document.getElementById("qvVariant").textContent =
    "Đang chọn: Màu " + variant.color + (variant.size ? " / Size " + variant.size : "") + " | SKU: " + p.sku;
  document.getElementById("qvDesc").textContent = p.description;
  const tb = document.getElementById("qvStock");
  tb.innerHTML = "";
  p.colors.forEach(function (c) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td><span class="dot" style="background:' + c.hex + '"></span> ' + c.name + "</td><td>" + c.stock + "</td>";
    tb.appendChild(tr);
  });
  dlg.showModal();
}

// Đóng các hộp thoại (nút có data-close hoặc bấm ra nền mờ)
document.querySelectorAll("dialog").forEach(function (d) {
  d.addEventListener("click", function (e) {
    if (e.target === d || e.target.closest("[data-close]")) d.close();
  });
});

// ---------------- Tạo ô chọn màu cho form tìm kiếm ----------------
function buildColorOptions(list) {
  const map = new Map();
  list.forEach(p => p.colors.forEach(c => { if (!map.has(c.name)) map.set(c.name, c.hex); }));
  const box = document.getElementById("colorOptions");
  box.innerHTML = "";
  map.forEach(function (hex, name) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "colors";
    input.value = name;
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = hex;
    label.appendChild(input);
    label.appendChild(dot);
    label.appendChild(document.createTextNode(name));
    box.appendChild(label);
  });
}

// ---------------- Đọc / ghi giá trị form ----------------
function getFilter() {
  const fd = new FormData(form);
  return {
    keyword: (fd.get("keyword") || "").trim(),
    category: fd.get("category") || "all",
    priceMin: parseFloat(fd.get("priceMin")) || 0,
    priceMax: parseFloat(fd.get("priceMax")),
    colors: fd.getAll("colors"),
    rating: parseFloat(fd.get("rating")) || 0,
    sort: fd.get("sort") || "default"
  };
}

function setFilter(f) {
  form.keyword.value = f.keyword || "";
  form.category.value = f.category || "all";
  priceMin.value = f.priceMin ?? 0;
  priceMax.value = f.priceMax ?? 1000;
  priceRange.value = priceMax.value;
  priceRangeOut.value = priceMax.value;
  form.querySelectorAll('input[name="colors"]').forEach(cb => { cb.checked = (f.colors || []).includes(cb.value); });
  const r = form.querySelector('input[name="rating"][value="' + (f.rating || 0) + '"]');
  if (r) r.checked = true;
  form.sort.value = f.sort || "default";
}

// ---------------- Lọc + sắp xếp ----------------
function applyFilter(f) {
  const kw = f.keyword.toLowerCase();
  let list = allProducts.filter(function (p) {
    if (kw && !p.title.toLowerCase().includes(kw)) return false;
    if (f.category !== "all" && p.category !== f.category) return false;
    if (p.salePrice < f.priceMin || p.salePrice > f.priceMax) return false;
    if (f.colors.length && !p.colors.some(c => f.colors.includes(c.name))) return false;
    if (p.rating.rate < f.rating) return false;
    return true;
  });
  if (f.sort === "price-asc") list.sort((a, b) => a.salePrice - b.salePrice);
  if (f.sort === "price-desc") list.sort((a, b) => b.salePrice - a.salePrice);
  if (f.sort === "rating-desc") list.sort((a, b) => b.rating.rate - a.rating.rate);
  return list;
}

// ---------------- Validation bổ sung (giá Từ <= giá Đến) ----------------
function validatePrice() {
  const min = parseFloat(priceMin.value), max = parseFloat(priceMax.value);
  if (!isNaN(min) && !isNaN(max) && min > max) {
    priceMax.setCustomValidity("Giá 'Đến' phải lớn hơn hoặc bằng giá 'Từ'.");
  } else {
    priceMax.setCustomValidity("");
  }
}
priceMin.addEventListener("input", validatePrice);
priceMax.addEventListener("input", function () {
  validatePrice();
  if (priceMax.value !== "") { priceRange.value = priceMax.value; priceRangeOut.value = priceMax.value; }
});
priceRange.addEventListener("input", function () {
  priceMax.value = priceRange.value;
  priceRangeOut.value = priceRange.value;
  validatePrice();
});

// ---------------- Sự kiện form tìm kiếm ----------------
let firstInvalid = true;
form.addEventListener("invalid", function (e) {
  if (!firstInvalid) return;
  firstInvalid = false;
  setTimeout(() => { firstInvalid = true; }, 0);
  const label = form.querySelector('label[for="' + e.target.id + '"]');
  const name = label ? label.firstChild.textContent.trim() : e.target.name;
  formError.textContent = name + ": " + viMessage(e.target);
}, true);

// Thông báo lỗi tiếng Việt dựa trên ValidityState của HTML5
function viMessage(el) {
  const v = el.validity;
  if (v.customError) return el.validationMessage;
  if (v.valueMissing) return "Vui lòng nhập/chọn giá trị.";
  if (v.tooShort) return "Cần ít nhất " + el.minLength + " ký tự.";
  if (v.tooLong) return "Tối đa " + el.maxLength + " ký tự.";
  if (v.patternMismatch) return el.title || "Sai định dạng.";
  if (v.rangeUnderflow) return "Giá trị phải từ " + el.min + " trở lên.";
  if (v.rangeOverflow) return "Giá trị không được vượt quá " + el.max + ".";
  if (v.stepMismatch) return "Chỉ nhập tối đa 2 chữ số thập phân.";
  if (v.badInput) return "Vui lòng nhập số hợp lệ.";
  return el.validationMessage;
}
form.addEventListener("input", function () { if (form.checkValidity()) formError.textContent = ""; });

form.addEventListener("submit", function (e) {
  e.preventDefault();
  validatePrice();
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  formError.textContent = "";
  const f = getFilter();
  lsSet(LS_FILTER, f);                  // lưu tạm bộ lọc
  renderProducts(applyFilter(f));
});

form.addEventListener("reset", function () {
  setTimeout(function () {
    priceRangeOut.value = priceRange.value;
    priceMax.setCustomValidity("");
    formError.textContent = "";
    lsRemove(LS_FILTER);
    renderProducts(allProducts);
  }, 0);
});

// ---------------- Khởi động ----------------
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function init() {
  showSkeleton(SKELETON_COUNT);
  try {
    const [res] = await Promise.all([
      fetch(DATA_URL),
      Reviews.load().catch(err => console.warn("Không đọc được reviews.xml:", err)),
      wait(MIN_LOADING_MS)
    ]);
    if (!res.ok) throw new Error("HTTP " + res.status);
    allProducts = await res.json();
    buildColorOptions(allProducts);

    const saved = lsGet(LS_FILTER, null);   // khôi phục bộ lọc lần trước
    if (saved) {
      setFilter(saved);
      renderProducts(applyFilter(getFilter()));
    } else {
      renderProducts(allProducts);
    }
  } catch (err) {
    grid.innerHTML = '<p class="empty-state">Không tải được ' + DATA_URL +
      ". Hãy mở trang bằng Live Server (" + err.message + ").</p>";
    grid.setAttribute("aria-busy", "false");
    resultInfo.textContent = "Lỗi tải dữ liệu";
  }
}

init();
