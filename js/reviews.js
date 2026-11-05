

const Reviews = {
  url: "data/reviews.xml",
  stats: {},          // { product_id: { sum, count, avg, list: [...] } }

  // Đọc file XML và phân tích
  async load() {
    const res = await fetch(this.url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    this.parse(text);
    return this.stats;
  },

  // Dùng DOMParser chuyển chuỗi XML thành cây DOM rồi duyệt từng <review>
  parse(xmlText) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "application/xml");
    if (xml.getElementsByTagName("parsererror").length > 0) {
      throw new Error("File reviews.xml không hợp lệ");
    }

    const stats = {};
    const nodes = xml.getElementsByTagName("review");
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const pid = node.getAttribute("product_id");
      const customer = node.getElementsByTagName("customer")[0];
      const review = {
        id: node.getAttribute("id"),
        customerId: customer.getAttribute("id"),
        customerName: customer.textContent,
        rating: Number(node.getElementsByTagName("rating")[0].textContent),
        comment: node.getElementsByTagName("comment")[0].textContent,
        date: node.getElementsByTagName("date")[0].textContent
      };
      if (!stats[pid]) stats[pid] = { sum: 0, count: 0, avg: 0, list: [] };
      stats[pid].sum += review.rating;
      stats[pid].count++;
      stats[pid].list.push(review);
    }

    // Tính điểm trung bình (làm tròn 1 chữ số thập phân)
    Object.keys(stats).forEach(function (pid) {
      const s = stats[pid];
      s.avg = Math.round((s.sum / s.count) * 10) / 10;
      s.list.sort((a, b) => b.date.localeCompare(a.date));
    });

    this.stats = stats;
    return stats;
  },

  get(productId) {
    return this.stats[String(productId)] || null;
  },

  // Tạo <span> số sao trung bình và chèn lên ảnh của từng sản phẩm
  renderBadges(container) {
    const self = this;
    container.querySelectorAll("article[data-id]").forEach(function (card) {
      const figure = card.querySelector(".product-image");
      const old = figure.querySelector(".avg-rating");
      if (old) old.remove();

      const s = self.get(card.dataset.id);
      const span = document.createElement("span");
      span.className = "avg-rating";
      span.dataset.action = "rating-detail";   // bấm vào cũng mở Rating Detail (Event Delegation)
      if (s) {
        span.textContent = "★ " + s.avg.toFixed(1) + " (" + s.count + ")";
        span.title = "Điểm trung bình " + s.avg.toFixed(1) + "/5 từ " + s.count + " đánh giá";
      } else {
        span.textContent = "Chưa có đánh giá";
        span.classList.add("none");
      }
      figure.appendChild(span);
    });
  },

  // Hiển thị danh sách khách hàng đã đánh giá sản phẩm
  showDetail(product) {
    const s = this.get(product.id);
    document.getElementById("rdTitle").textContent = "Rating Detail - " + product.title;
    const summary = document.getElementById("rdSummary");
    const list = document.getElementById("rdList");
    list.innerHTML = "";

    if (!s) {
      summary.textContent = "Sản phẩm chưa có đánh giá nào.";
    } else {
      summary.innerHTML = '<span class="stars">' + "★".repeat(Math.round(s.avg)) + "☆".repeat(5 - Math.round(s.avg)) +
        "</span> <strong>" + s.avg.toFixed(1) + "/5</strong> - " + s.count + " khách hàng đã đánh giá";
      s.list.forEach(function (r) {
        const li = document.createElement("li");
        const head = document.createElement("div");
        head.className = "rd-head";
        const who = document.createElement("strong");
        who.textContent = r.customerName + " (" + r.customerId + ")";
        const st = document.createElement("span");
        st.className = "stars";
        st.textContent = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
        head.appendChild(who);
        head.appendChild(st);
        const cmt = document.createElement("p");
        cmt.textContent = r.comment;
        const date = document.createElement("small");
        date.textContent = r.date;
        li.appendChild(head);
        li.appendChild(cmt);
        li.appendChild(date);
        list.appendChild(li);
      });
    }
    document.getElementById("ratingDialog").showModal();
  }
};
