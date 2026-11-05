

const Cart = {
  STORAGE_KEY: "shop_cart_state",
  FREE_SHIP_FROM: 200,     // miễn phí vận chuyển từ $200
  SHIP_FEE: 2.5,
  items: [],               // [{ key, productId, title, image, color, size, price, quantity, maxStock }]

  // ---------- Lưu / đọc localStorage ----------
  load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : [];
      this.items = Array.isArray(data) ? data : [];
    } catch (e) { this.items = []; }
  },
  save() {
    try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.items)); } catch (e) { }
  },

  // Khóa phân biệt: cùng sản phẩm + cùng màu + cùng size
  keyOf(productId, color, size) {
    return productId + "|" + (color || "") + "|" + (size || "");
  },

  find(key) {
    return this.items.find(i => i.key === key);
  },

  // ---------- Thêm vào giỏ ----------
  add(product, variant, qty) {
    qty = qty || 1;
    const color = variant.color || null;
    const size = variant.size || null;
    const key = this.keyOf(product.id, color, size);
    const c = product.colors.find(x => x.name === color);
    const maxStock = c ? c.stock : product.stock;

    const item = this.find(key);
    if (item) {
      // Đã tồn tại cùng màu/size => tăng số lượng
      if (item.quantity + qty > maxStock) {
        return { ok: false, msg: "Chỉ còn " + maxStock + " sản phẩm màu " + color + " trong kho." };
      }
      item.quantity += qty;
    } else {
      // Chưa có => thêm mới
      this.items.push({
        key: key,
        productId: product.id,
        title: product.title,
        image: product.image,
        color: color,
        size: size,
        price: product.salePrice,
        quantity: qty,
        maxStock: maxStock
      });
    }
    this.update();
    return { ok: true, isNew: !item, item: this.find(key) };
  },

  increase(key) {
    const item = this.find(key);
    if (!item) return;
    if (item.quantity >= item.maxStock) { showToast("Đã đạt số lượng tồn kho tối đa.", true); return; }
    item.quantity++;
    this.update();
  },

  decrease(key) {
    const item = this.find(key);
    if (!item) return;
    item.quantity--;
    if (item.quantity <= 0) this.items = this.items.filter(i => i.key !== key);
    this.update();
  },

  remove(key) {
    this.items = this.items.filter(i => i.key !== key);
    this.update();
  },

  clear() {
    this.items = [];
    this.update();
  },

  // ---------- Tự động tính tổng tiền ----------
  calcTotals() {
    const count = this.items.reduce((s, i) => s + i.quantity, 0);
    const subtotal = Math.round(this.items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100;
    const shipping = subtotal === 0 || subtotal >= this.FREE_SHIP_FROM ? 0 : this.SHIP_FEE;
    const total = Math.round((subtotal + shipping) * 100) / 100;
    return { count: count, subtotal: subtotal, shipping: shipping, total: total };
  },

  // Mỗi lần giỏ thay đổi: lưu + vẽ lại
  update() {
    this.save();
    this.render();
  },

  // ---------- Vẽ Mini-cart ----------
  render() {
    const t = this.calcTotals();
    document.getElementById("cartCount").value = t.count;

    const ul = document.getElementById("miniCartItems");
    ul.innerHTML = "";
    if (this.items.length === 0) {
      const li = document.createElement("li");
      li.className = "mini-cart-empty";
      li.textContent = "Giỏ hàng đang trống.";
      ul.appendChild(li);
    }
    this.items.forEach(function (i) {
      const li = document.createElement("li");
      li.className = "mini-cart-item";
      li.dataset.key = i.key;

      const img = document.createElement("img");
      img.src = i.image;
      img.alt = "";

      const info = document.createElement("div");
      info.className = "mc-info";
      const title = document.createElement("p");
      title.className = "mc-title";
      title.textContent = i.title;
      const variant = document.createElement("p");
      variant.className = "mc-variant";
      variant.textContent = "Màu: " + i.color + (i.size ? " | Size: " + i.size : "") + " | $" + i.price.toFixed(2);
      const qty = document.createElement("div");
      qty.className = "mc-qty";
      qty.innerHTML =
        '<button type="button" class="qty-btn" data-cart="dec" aria-label="Giảm">−</button>' +
        '<span>' + i.quantity + '</span>' +
        '<button type="button" class="qty-btn" data-cart="inc" aria-label="Tăng">+</button>';
      info.appendChild(title);
      info.appendChild(variant);
      info.appendChild(qty);

      const right = document.createElement("div");
      right.className = "mc-right";
      right.innerHTML =
        '<strong>$' + (i.price * i.quantity).toFixed(2) + '</strong>' +
        '<button type="button" class="icon-btn" data-cart="remove" aria-label="Xóa">🗑</button>';

      li.appendChild(img);
      li.appendChild(info);
      li.appendChild(right);
      ul.appendChild(li);
    });

    document.getElementById("cartSubtotal").textContent = "$" + t.subtotal.toFixed(2);
    document.getElementById("cartShipping").textContent = t.shipping === 0 ? (t.subtotal ? "Miễn phí" : "$0.00") : "$" + t.shipping.toFixed(2);
    document.getElementById("cartTotal").textContent = "$" + t.total.toFixed(2);
    document.getElementById("btnCheckout").disabled = this.items.length === 0;
  },

  // ---------- Mở / đóng Mini-cart ----------
  open() {
    const mc = document.getElementById("miniCart");
    mc.hidden = false;
    document.getElementById("cartToggle").setAttribute("aria-expanded", "true");
    // Nếu mini-cart đang nằm ngoài màn hình (đã cuộn xuống trên mobile) thì cuộn tới
    if (mc.getBoundingClientRect().top < 0) mc.scrollIntoView({ behavior: "smooth", block: "start" });
  },
  close() {
    document.getElementById("miniCart").hidden = true;
    document.getElementById("cartToggle").setAttribute("aria-expanded", "false");
  },
  toggle() {
    if (document.getElementById("miniCart").hidden) this.open(); else this.close();
  },

  init() {
    this.load();
    this.render();
    const self = this;
    document.getElementById("cartToggle").addEventListener("click", function () { self.toggle(); });

    // Mini-cart cũng dùng Event Delegation cho các nút bên trong
    document.getElementById("miniCart").addEventListener("click", function (e) {
      const btn = e.target.closest("[data-cart]");
      if (!btn) return;
      const li = btn.closest("[data-key]");
      const key = li ? li.dataset.key : null;
      switch (btn.dataset.cart) {
        case "inc": self.increase(key); break;
        case "dec": self.decrease(key); break;
        case "remove": self.remove(key); break;
        case "clear": self.clear(); break;
        case "close": self.close(); break;
        case "checkout": self.close(); Checkout.open(); break;   // Câu 7
      }
    });

    document.addEventListener("keydown", function (e) { if (e.key === "Escape") self.close(); });
  }
};

// ---------- Thông báo nhanh (dùng chung) ----------
let toastTimer = null;
function showToast(message, isError) {
  const t = document.getElementById("toast");
  t.textContent = message;
  t.classList.toggle("error", !!isError);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

Cart.init();
