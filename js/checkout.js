
const Checkout = {
  ORDERS_KEY: "shop_orders",       // danh sách đơn hàng đã thanh toán
  SHIPPING_KEY: "shop_shipping",   // lưu tạm thông tin giao hàng lần trước

  // Bộ quy tắc Regex tự định nghĩa
  RULES: {
    fullName: {
      label: "họ và tên",
      // Ít nhất 2 từ, chỉ gồm chữ cái (có dấu tiếng Việt), 2-50 ký tự
      regex: /^(?=.{2,50}$)[A-Za-zÀ-ỹ]+(?: [A-Za-zÀ-ỹ]+)+$/,
      message: "Họ tên gồm ít nhất 2 từ, chỉ chứa chữ cái (2–50 ký tự)."
    },
    phone: {
      label: "số điện thoại",
      // Số di động VN: 0 hoặc +84, sau đó đầu số 3/5/7/8/9 và 8 chữ số
      regex: /^(?:0|\+84)(?:3|5|7|8|9)\d{8}$/,
      normalize: v => v.replace(/[\s.\-]/g, ""),
      message: "SĐT Việt Nam gồm 10 số, bắt đầu bằng 03, 05, 07, 08, 09 (hoặc +84)."
    },
    email: {
      label: "email",
      regex: /^[A-Za-z0-9](?:[A-Za-z0-9._%+\-]*[A-Za-z0-9])?@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}$/,
      message: "Email không đúng định dạng (VD: ten@gmail.com)."
    },
    address: {
      label: "địa chỉ giao hàng",
      regex: /^.{10,200}$/,
      message: "Địa chỉ cần từ 10 đến 200 ký tự."
    }
  },

  form: null,

  // Kiểm tra 1 ô nhập, hiển thị thông báo ngay bên dưới
  validateField(input) {
    const rule = this.RULES[input.name];
    if (!rule) return true;
    const raw = input.value.trim();
    const value = rule.normalize ? rule.normalize(raw) : raw;
    const msg = document.getElementById(input.id + "Msg");
    let error = "";

    if (value === "") error = "Vui lòng nhập " + rule.label + ".";
    else if (!rule.regex.test(value)) error = rule.message;

    input.classList.toggle("is-invalid", error !== "");
    input.classList.toggle("is-valid", error === "");
    input.setAttribute("aria-invalid", error ? "true" : "false");
    msg.textContent = error || "✓ Hợp lệ";
    msg.classList.toggle("ok", error === "");
    return error === "";
  },

  validateAll() {
    let firstBad = null;
    const self = this;
    Object.keys(this.RULES).forEach(function (name) {
      const input = self.form.elements[name];
      if (!self.validateField(input) && !firstBad) firstBad = input;
    });
    return firstBad;
  },

  // API thanh toán giả lập (trả về Promise sau 1 giây)
  fakePaymentApi(order) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        if (!order.items.length) { reject(new Error("Giỏ hàng trống")); return; }
        resolve({
          status: 200,
          success: true,
          orderId: "DH" + Date.now().toString().slice(-8),
          paidAt: new Date().toISOString(),
          message: "Thanh toán thành công"
        });
      }, 1000);
    });
  },

  // Tóm tắt đơn hàng bên phải form
  renderSummary() {
    const ul = document.getElementById("coItems");
    ul.innerHTML = "";
    Cart.items.forEach(function (i) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = i.quantity + " × " + i.title.slice(0, 32) + " (" + i.color + (i.size ? "/" + i.size : "") + ")";
      const price = document.createElement("strong");
      price.textContent = "$" + (i.price * i.quantity).toFixed(2);
      li.appendChild(name);
      li.appendChild(price);
      ul.appendChild(li);
    });
    const t = Cart.calcTotals();
    document.getElementById("coSubtotal").textContent = "$" + t.subtotal.toFixed(2);
    document.getElementById("coShipping").textContent = t.shipping === 0 ? "Miễn phí" : "$" + t.shipping.toFixed(2);
    document.getElementById("coTotal").textContent = "$" + t.total.toFixed(2);
  },

  open() {
    if (Cart.items.length === 0) { showToast("Giỏ hàng trống, hãy thêm sản phẩm trước.", true); return; }
    document.getElementById("checkoutBody").hidden = false;
    document.getElementById("checkoutSuccess").hidden = true;
    document.getElementById("coError").textContent = "";
    this.renderSummary();

    // Điền sẵn thông tin giao hàng đã lưu lần trước (nếu có)
    try {
      const saved = JSON.parse(localStorage.getItem(this.SHIPPING_KEY) || "null");
      if (saved) ["fullName", "phone", "email", "address"].forEach(n => { if (!this.form.elements[n].value) this.form.elements[n].value = saved[n] || ""; });
    } catch (e) { }

    document.getElementById("checkoutDialog").showModal();
  },

  async submit(e) {
    e.preventDefault();
    const errorBox = document.getElementById("coError");
    const firstBad = this.validateAll();
    if (firstBad) {
      errorBox.textContent = "Vui lòng kiểm tra lại các thông tin được đánh dấu đỏ.";
      firstBad.focus();
      return;
    }
    errorBox.textContent = "";

    const fd = new FormData(this.form);
    const t = Cart.calcTotals();
    const order = {
      customer: {
        fullName: fd.get("fullName").trim(),
        phone: this.RULES.phone.normalize(fd.get("phone").trim()),
        email: fd.get("email").trim(),
        address: fd.get("address").trim()
      },
      payment: fd.get("payment"),
      note: fd.get("note").trim(),
      items: Cart.items.map(i => ({ productId: i.productId, title: i.title, color: i.color, size: i.size, price: i.price, quantity: i.quantity })),
      subtotal: t.subtotal,
      shipping: t.shipping,
      total: t.total,
      createdAt: new Date().toISOString()
    };

    const btn = document.getElementById("coSubmit");
    btn.disabled = true;
    btn.textContent = "Đang xử lý thanh toán...";
    try {
      const res = await this.fakePaymentApi(order);
      order.id = res.orderId;
      order.status = "paid";
      order.paidAt = res.paidAt;

      // Lưu đơn hàng vào localStorage
      const orders = JSON.parse(localStorage.getItem(this.ORDERS_KEY) || "[]");
      orders.push(order);
      localStorage.setItem(this.ORDERS_KEY, JSON.stringify(orders));
      localStorage.setItem(this.SHIPPING_KEY, JSON.stringify(order.customer));

      Cart.clear();
      document.getElementById("coOrderId").textContent = order.id;
      document.getElementById("coOrderInfo").textContent =
        "Tổng thanh toán $" + order.total.toFixed(2) + " (" + order.payment + "). Đơn hàng sẽ giao đến: " + order.customer.address + ".";
      document.getElementById("checkoutBody").hidden = true;
      document.getElementById("checkoutSuccess").hidden = false;
      this.form.reset();
      this.form.querySelectorAll(".is-valid, .is-invalid").forEach(el => el.classList.remove("is-valid", "is-invalid"));
      this.form.querySelectorAll(".field-msg").forEach(el => { el.textContent = ""; el.classList.remove("ok"); });
    } catch (err) {
      errorBox.textContent = "Thanh toán thất bại: " + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Xác nhận thanh toán";
    }
  },

  init() {
    this.form = document.getElementById("checkoutForm");
    const self = this;
    // Kiểm tra ngay lập tức khi gõ phím (keyup) và khi rời ô (blur)
    Object.keys(this.RULES).forEach(function (name) {
      const input = self.form.elements[name];
      input.addEventListener("keyup", function () { self.validateField(input); });
      input.addEventListener("blur", function () { self.validateField(input); });
    });
    this.form.addEventListener("submit", function (e) { self.submit(e); });
  }
};

Checkout.init();
