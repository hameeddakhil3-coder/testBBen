const sidebar = document.querySelector("#sidebar");
const menuToggle = document.querySelector("#menu-toggle");
const breadcrumbTitle = document.querySelector("#breadcrumb-title");
const pageTitle = document.querySelector("#page-title");
const overviewSections = [
  document.querySelector(".stats-grid"),
  document.querySelector(".content-grid"),
  document.querySelector("#products-section")
];
const views = {
  overview: null,
  products: document.querySelector("#products-view"),
  orders: document.querySelector("#orders-view"),
  analytics: document.querySelector("#analytics-view")
};
let products = [];
let currentUser = null;
let currentStore = null;
let merchantOrders = [];
let orderFilter = "all";
let activeProductsOnly = false;
const db = window.bbenSupabase;
let toastTimer;

function showToast(text) {
  const toast = document.querySelector("#toast");
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function showView(view, options = {}) {
  const titles = {overview:"نظرة عامة",products:"إدارة المنتجات",orders:"إدارة الطلبات",analytics:"المبيعات والتقارير"};
  const isOverview = view === "overview";
  if (view === "products") activeProductsOnly = options.activeOnly === true;
  if (view === "orders" && options.pendingOnly !== undefined) orderFilter = options.pendingOnly ? "pending" : "all";
  overviewSections.forEach((section) => section.classList.toggle("hidden", !isOverview));
  Object.entries(views).forEach(([key, element]) => {
    if (element) element.classList.toggle("hidden", key !== view);
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  breadcrumbTitle.textContent = titles[view] || titles.overview;
  pageTitle.textContent = isOverview ? "صباح الخير، تاجرنا 👋" : titles[view];
  sidebar.classList.remove("open");
  if (view === "products") {
    document.querySelector("#products-view-title").textContent = activeProductsOnly ? "المنتجات النشطة" : "إدارة المنتجات";
    document.querySelector("#products-view-description").textContent = activeProductsOnly ? "هذه المنتجات النشطة المعروضة للبيع في متجرك." : "أضف منتجاتك واحفظها في قاعدة البيانات.";
    document.querySelector("#clear-product-filter-button").classList.toggle("hidden", !activeProductsOnly);
    renderProductList();
  }
  if (view === "orders") {
    document.querySelector("#orders-view-title").textContent = orderFilter === "pending" ? "الطلبات بانتظار المعالجة" : "إدارة الطلبات";
    document.querySelector("#orders-view-description").textContent = orderFilter === "pending" ? "الطلبات التي لم يبدأ تجهيزها بعد." : "طلبات زبائن متجرك المحفوظة في قاعدة البيانات. يمكنك تحديث حالة كل طلب.";
    document.querySelector("#clear-order-filter-button").classList.toggle("hidden", orderFilter !== "pending");
    if (currentStore) loadMerchantOrders();
  }
  if (view === "analytics") updateOrderSummary();
  window.scrollTo({top:0,behavior:"smooth"});
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.go)));
document.querySelectorAll("[data-stat-target]").forEach((card) => {
  const activate = () => {
    const target = card.dataset.statTarget;
    if (target === "pending-orders") showView("orders", { pendingOnly: true });
    else if (target === "active-products") showView("products", { activeOnly: true });
    else if (target === "orders") showView("orders", { pendingOnly: false });
    else showView("analytics");
  };
  card.addEventListener("click", activate);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); }
  });
});
document.querySelector("#clear-order-filter-button").addEventListener("click", () => showView("orders", { pendingOnly: false }));
document.querySelector("#clear-product-filter-button").addEventListener("click", () => showView("products", { activeOnly: false }));
menuToggle.addEventListener("click", () => sidebar.classList.toggle("open"));
document.querySelector("#notification-button").addEventListener("click", () => showToast("لا توجد إشعارات جديدة."));
document.querySelector("#refresh-orders-button").addEventListener("click", loadMerchantOrders);
document.querySelector("#profile-button").addEventListener("click", () => { window.location.href = "merchant-profile.html"; });
document.querySelector("#logout-button").addEventListener("click", async () => { if (db) await db.auth.signOut(); window.location.href = "index.html"; });
document.querySelector("#help-button").addEventListener("click", () => showToast("مركز المساعدة قيد التجهيز."));

const dialog = document.querySelector("#product-dialog");
const productForm = document.querySelector("#product-form");
const productName = document.querySelector("#product-name");
const productPrice = document.querySelector("#product-price");
const productStock = document.querySelector("#product-stock");
const productCategory = document.querySelector("#product-category");
const dialogError = document.querySelector("#dialog-error");
const productImage = document.querySelector("#product-image");
const productImagePreview = document.querySelector("#product-image-preview");
let editingProductId = null;
productImage.addEventListener("change", () => {
  const file = productImage.files?.[0];
  if (!file) { productImagePreview.classList.add("hidden"); productImagePreview.removeAttribute("src"); return; }
  if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
    productImage.value = ""; productImagePreview.classList.add("hidden");
    showToast("اختر صورة صالحة لا يتجاوز حجمها 5 ميغابايت."); return;
  }
  productImagePreview.src = URL.createObjectURL(file);
  productImagePreview.classList.remove("hidden");
});
async function uploadImage(file, folder) {
  if (!file) return null;
  if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) throw new Error("يجب أن تكون الصورة من نوع صورة وحجمها 5 ميغابايت أو أقل.");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = currentUser.id + "/" + folder + "/" + crypto.randomUUID() + "." + ext;
  const { error } = await db.storage.from("bben-images").upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return db.storage.from("bben-images").getPublicUrl(path).data.publicUrl;
}

function openProductDialog(product = null) {
  editingProductId = product?.id || null;
  dialogError.textContent = "";
  productForm.reset();
  productImagePreview.classList.add("hidden");
  productImagePreview.removeAttribute("src");
  document.querySelector("#product-dialog-title").textContent = product ? "تعديل المنتج" : "إضافة منتج";
  productForm.querySelector('button[type="submit"]').textContent = product ? "حفظ التعديلات" : "حفظ المنتج";
  if (product) {
    productName.value = product.name || "";
    productPrice.value = product.price ?? "";
    productStock.value = product.stock_quantity ?? 0;
    productCategory.value = product.categories?.name || "أخرى";
    if (product.image_url) { productImagePreview.src = product.image_url; productImagePreview.classList.remove("hidden"); }
  }
  if (typeof dialog.showModal === "function") dialog.showModal();
  else showToast("المتصفح لا يدعم نافذة الإضافة؛ جرّب متصفحاً أحدث.");
}
document.querySelector("#add-product-top").addEventListener("click", openProductDialog);
document.querySelector("#quick-add-product").addEventListener("click", openProductDialog);
document.querySelector("#add-product-view").addEventListener("click", openProductDialog);
document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());
document.querySelector("#cancel-dialog").addEventListener("click", () => dialog.close());

function renderProductList() {
  const list = document.querySelector("#product-list");
  list.replaceChildren();
  const visibleProducts = activeProductsOnly ? products.filter((product) => product.status === "active") : products;
  if (!visibleProducts.length) {
    const note = document.createElement("p");
    note.className = "dialog-note";
    note.textContent = activeProductsOnly
      ? "لا توجد منتجات نشطة حالياً."
      : "لا توجد منتجات محفوظة بعد. اضغط «إضافة منتج» لإضافة أول منتج إلى قاعدة البيانات.";
    list.append(note);
    return;
  }
  visibleProducts.forEach((product) => {
    const row = document.createElement("div");
    row.className = "product-list-row";
    const icon = product.image_url ? document.createElement("img") : document.createElement("span");
    icon.className = "list-product-icon";
    if (product.image_url) { icon.src = product.image_url; icon.alt = product.name; } else icon.textContent = "📦";
    const info = document.createElement("span");
    info.className = "list-product-info";
    const name = document.createElement("strong");
    name.textContent = product.name;
    const detail = document.createElement("small");
    detail.textContent = (product.categories?.name || "غير مصنف") + " · الكمية: " + product.stock_quantity;
    info.append(name,detail);
    const price = document.createElement("span");
    price.className = "list-price";
    price.textContent = new Intl.NumberFormat("ar-IQ").format(product.price) + " د.ع";
    const edit = document.createElement("button");
    edit.type = "button"; edit.className = "edit-product-button"; edit.textContent = "تعديل";
    edit.addEventListener("click", () => openProductDialog(product));
    row.append(icon,info,price,edit);
    list.append(row);
  });
}

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = productName.value.trim();
  const price = Number(productPrice.value);
  const stock = Number(productStock.value);
  if (name.length < 2 || !Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) {
    dialogError.textContent = "تأكد من اسم المنتج والسعر والكمية."; return;
  }
  if (!db || !currentUser || !currentStore) {
    dialogError.textContent = "تعذر التحقق من حساب التاجر أو متجره. أعد تحميل الصفحة."; return;
  }
  const submit = productForm.querySelector('button[type="submit"]');
  submit.disabled = true; dialogError.textContent = "";
  try {
    const { data: category } = await db.from("categories").select("id").eq("name", productCategory.value).maybeSingle();
    const imageFile = productImage.files?.[0];
    const existing = editingProductId ? products.find((item) => item.id === editingProductId) : null;
    let imageUrl = existing?.image_url || null;
    if (imageFile) imageUrl = await uploadImage(imageFile, "products");
    const payload = { store_id: currentStore.id, category_id: category?.id || null, name, price, currency: "IQD", stock_quantity: stock, image_url: imageUrl, status: "active" };
    let saved;
    if (editingProductId) {
      const result = await db.from("products").update(payload).eq("id", editingProductId).eq("store_id", currentStore.id)
        .select("id,name,price,stock_quantity,status,category_id,image_url").single();
      if (result.error) throw result.error;
      saved = result.data;
      products = products.map((item) => item.id === saved.id ? { ...saved, categories: { name: productCategory.value } } : item);
    } else {
      const result = await db.from("products").insert(payload).select("id,name,price,stock_quantity,status,category_id,image_url").single();
      if (result.error) throw result.error;
      saved = result.data;
      products.unshift({ ...saved, categories: { name: productCategory.value } });
    }
    updateProductCounts(); productForm.reset();
    productImagePreview.classList.add("hidden"); productImagePreview.removeAttribute("src");
    editingProductId = null; dialog.close(); renderProductList(); renderProductCards(); showView("products");
    showToast("تم حفظ بيانات المنتج بنجاح.");
  } catch (error) { dialogError.textContent = "تعذر حفظ المنتج: " + error.message; }
  finally { submit.disabled = false; }
});

function updateProductCounts() {
  const count = products.length;
  const activeCount = products.filter((product) => product.status === "active").length;
  document.querySelector("#product-nav-count").textContent = String(count);
  document.querySelector("#active-products-value").innerHTML = activeCount + ' <small>منتجاً</small>';
  const badge = document.querySelector(".demo-badge");
  if (badge) badge.innerHTML = "<span></span>متصل بقاعدة البيانات";
}


const orderStatusLabels = {
  pending: "قيد الانتظار",
  processing: "قيد المعالجة",
  shipped: "قيد التوصيل",
  delivered: "مكتمل",
  cancelled: "ملغي"
};
const orderMoney = (value) => new Intl.NumberFormat("ar-IQ").format(Number(value) || 0) + " د.ع";
const orderStatusClass = (status) => ({
  pending: "status-pending",
  processing: "status-pending",
  shipped: "status-shipping",
  delivered: "status-complete",
  cancelled: "status-cancelled"
}[status] || "status-pending");

function renderRecentOrders() {
  const body = document.querySelector("#orders-table-body");
  body.replaceChildren();
  const recent = merchantOrders.slice(0, 4);
  if (!recent.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "لا توجد طلبات لهذا المتجر حتى الآن.";
    row.append(cell); body.append(row); return;
  }
  recent.forEach((order) => {
    const row = document.createElement("tr");
    const number = document.createElement("td");
    const strong = document.createElement("strong");
    strong.textContent = "#BB-" + order.order_number; number.append(strong);
    const customer = document.createElement("td"); customer.textContent = order.customer_name || "زبون";
    const date = document.createElement("td");
    date.textContent = new Date(order.created_at).toLocaleString("ar-IQ", { dateStyle: "medium", timeStyle: "short" });
    const amount = order.order_items.reduce((sum, item) => sum + Number(item.line_total ?? (Number(item.unit_price) * Number(item.quantity))), 0);
    const total = document.createElement("td"); total.textContent = orderMoney(amount);
    const status = document.createElement("td");
    const badge = document.createElement("span"); badge.className = "status " + orderStatusClass(order.status);
    badge.textContent = orderStatusLabels[order.status] || order.status; status.append(badge);
    row.append(number, customer, date, total, status); body.append(row);
  });
}

function updateOrderSummary() {
  const count = merchantOrders.length;
  const pending = merchantOrders.filter((order) => order.status === "pending").length;
  const completedOrders = merchantOrders.filter((order) => order.status === "delivered");
  const completedSales = completedOrders.reduce((sum, order) => {
    return sum + order.order_items.reduce((lineSum, item) => lineSum + Number(item.line_total ?? (Number(item.unit_price) * Number(item.quantity))), 0);
  }, 0);
  const average = completedOrders.length ? completedSales / completedOrders.length : 0;
  const salesValue = document.querySelector("#total-sales-value");
  const salesNote = document.querySelector("#sales-summary-note");
  const ordersValue = document.querySelector("#orders-count-value");
  const ordersNote = document.querySelector("#orders-summary-note");
  const pendingValue = document.querySelector("#pending-orders-value");
  const pendingNote = document.querySelector("#pending-summary-note");
  if (salesValue) salesValue.textContent = orderMoney(completedSales);
  if (salesNote) salesNote.textContent = completedSales ? "المبيعات من الطلبات المكتملة" : "لا توجد مبيعات مكتملة حالياً";
  if (ordersValue) ordersValue.textContent = count + " طلب";
  if (ordersNote) ordersNote.textContent = count ? "الطلبات المسجلة لمتجرك" : "لا توجد طلبات حالياً";
  if (pendingValue) pendingValue.textContent = pending + " طلب";
  if (pendingNote) pendingNote.textContent = pending ? "تحتاج إلى متابعة" : "لا توجد طلبات معلّقة";
  const progress = document.querySelector(".pending-progress span");
  if (progress) progress.style.width = (count ? Math.round((pending / count) * 100) : 0) + "%";

  const analyticsSales = document.querySelector("#analytics-sales-total");
  const analyticsOrders = document.querySelector("#analytics-orders-count");
  const analyticsAverage = document.querySelector("#analytics-average-order");
  const analyticsEmpty = document.querySelector("#analytics-empty-note");
  if (analyticsSales) analyticsSales.textContent = orderMoney(completedSales);
  if (analyticsOrders) analyticsOrders.textContent = String(count);
  if (analyticsAverage) analyticsAverage.textContent = orderMoney(average);
  if (analyticsEmpty) {
    analyticsEmpty.textContent = completedOrders.length
      ? "المبيعات محسوبة من الطلبات المكتملة فقط."
      : "لا توجد مبيعات مكتملة حالياً. ستظهر الأرقام بعد إكمال الطلبات.";
    analyticsEmpty.classList.toggle("hidden", completedOrders.length > 0);
  }
  document.querySelectorAll(".pending-count").forEach((badge) => { badge.textContent = String(pending); });
}

function renderMerchantOrders() {
  const host = document.querySelector("#merchant-orders-list");
  host.replaceChildren();
  const visibleOrders = orderFilter === "pending"
    ? merchantOrders.filter((order) => order.status === "pending")
    : merchantOrders;
  if (!visibleOrders.length) {
    const empty = document.createElement("div");
    empty.className = "notice-box";
    empty.textContent = orderFilter === "pending"
      ? "لا توجد طلبات بانتظار المعالجة حالياً."
      : "لا توجد طلبات لهذا المتجر حالياً. ستظهر هنا الطلبات الجديدة التي يسجلها الزبائن من السوق.";
    host.append(empty);
    renderRecentOrders(); updateOrderSummary(); return;
  }
  visibleOrders.forEach((order) => {
    const card = document.createElement("article"); card.className = "merchant-order-card";
    const head = document.createElement("div"); head.className = "merchant-order-head";
    const heading = document.createElement("div");
    const number = document.createElement("strong"); number.textContent = "#BB-" + order.order_number;
    const date = document.createElement("small");
    date.textContent = new Date(order.created_at).toLocaleString("ar-IQ", { dateStyle: "medium", timeStyle: "short" });
    heading.append(number, date);
    const status = document.createElement("span"); status.className = "status " + orderStatusClass(order.status);
    status.textContent = orderStatusLabels[order.status] || order.status;
    head.append(heading, status); card.append(head);

    const customer = document.createElement("div"); customer.className = "merchant-order-customer";
    const customerName = document.createElement("strong"); customerName.textContent = order.customer_name || "لم يذكر الاسم";
    const phone = document.createElement("a"); phone.textContent = order.customer_phone || "لم يذكر رقم الهاتف";
    if (order.customer_phone) phone.href = "tel:" + order.customer_phone.replace(/[^+0-9]/g, "");
    const address = document.createElement("p"); address.textContent = "عنوان التوصيل: " + (order.shipping_address || "غير محدد");
    customer.append(customerName, phone, address); card.append(customer);

    const items = document.createElement("div"); items.className = "merchant-order-items";
    order.order_items.forEach((item) => {
      const line = document.createElement("div"); line.className = "merchant-order-line";
      const label = document.createElement("span"); label.textContent = item.product_name + " × " + item.quantity;
      const price = document.createElement("strong");
      price.textContent = orderMoney(item.line_total ?? (Number(item.unit_price) * Number(item.quantity)));
      line.append(label, price); items.append(line);
    });
    card.append(items);
    if (order.notes) {
      const notes = document.createElement("p"); notes.className = "merchant-order-notes";
      notes.textContent = "ملاحظات الزبون: " + order.notes; card.append(notes);
    }
    const total = order.order_items.reduce((sum, item) => sum + Number(item.line_total ?? (Number(item.unit_price) * Number(item.quantity))), 0);
    const footer = document.createElement("div"); footer.className = "merchant-order-footer";
    const totalLabel = document.createElement("div");
    const totalCaption = document.createElement("small"); totalCaption.textContent = "إجمالي منتجات متجرك";
    const totalValue = document.createElement("strong"); totalValue.textContent = orderMoney(total);
    totalLabel.append(totalCaption, totalValue);
    const controls = document.createElement("label"); controls.className = "order-status-control";
    const controlsLabel = document.createElement("span"); controlsLabel.textContent = "تحديث الحالة";
    const select = document.createElement("select"); select.setAttribute("aria-label", "تحديث حالة الطلب #" + order.order_number);
    const transitions = {
      pending: ["pending", "processing", "cancelled"],
      processing: ["processing", "shipped", "cancelled"],
      shipped: ["shipped", "delivered"],
      delivered: ["delivered"],
      cancelled: ["cancelled"]
    };
    (transitions[order.status] || [order.status]).forEach((value) => {
      const option = document.createElement("option"); option.value = value; option.textContent = orderStatusLabels[value] || value;
      select.append(option);
    });
    select.value = order.status;
    select.addEventListener("change", () => updateMerchantOrderStatus(order, select));
    controls.append(controlsLabel, select); footer.append(totalLabel, controls); card.append(footer);
    host.append(card);
  });
  renderRecentOrders(); updateOrderSummary();
}

async function loadMerchantOrders() {
  const host = document.querySelector("#merchant-orders-list");
  if (!db || !currentStore || !host) return;
  host.replaceChildren();
  const loading = document.createElement("div"); loading.className = "notice-box"; loading.textContent = "جارٍ تحميل الطلبات من قاعدة البيانات..."; host.append(loading);
  const { data, error } = await db.from("orders")
    .select("id,order_number,status,customer_name,customer_phone,shipping_address,notes,created_at,order_items!inner(id,store_id,product_name,unit_price,quantity,line_total)")
    .eq("order_items.store_id", currentStore.id)
    .order("created_at", { ascending: false });
  if (error) {
    host.replaceChildren();
    const notice = document.createElement("div"); notice.className = "notice-box"; notice.textContent = "تعذر تحميل الطلبات: " + error.message; host.append(notice);
    showToast("تعذر تحميل الطلبات من قاعدة البيانات.");
    return;
  }
  merchantOrders = (data || []).map((order) => ({ ...order, order_items: order.order_items || [] }));
  renderMerchantOrders();
}

async function updateMerchantOrderStatus(order, select) {
  const previous = order.status;
  const next = select.value;
  if (next === previous) return;
  if (next === "cancelled" && !window.confirm("هل تريد إلغاء الطلب #" + order.order_number + "؟ ستُعاد الكميات الخاصة بمتجرك إلى المخزون.")) {
    select.value = previous;
    return;
  }
  select.disabled = true;
  try {
    const { data, error } = await db.rpc("update_merchant_order_status", {
      p_order_id: order.id,
      p_next_status: next
    });
    if (error) throw error;
    if (!data?.success || !data.status) throw new Error("لم يصل تأكيد تحديث الحالة من النظام.");
    order.status = data.status;
    showToast("تم تحديث حالة الطلب #" + order.order_number + " إلى «" + (orderStatusLabels[data.status] || data.status) + "».");
    if (data.status === "cancelled") {
      const { data: refreshedProducts, error: productsError } = await db.from("products")
        .select("id,name,price,stock_quantity,status,category_id,image_url,categories(name)")
        .eq("store_id", currentStore.id).order("created_at", { ascending: false });
      if (!productsError) {
        products = refreshedProducts || [];
        updateProductCounts();
        renderProductList();
        renderProductCards();
      }
    }
    await loadMerchantOrders();
  } catch (error) {
    select.value = previous;
    showToast("تعذر تحديث حالة الطلب: " + (error.message || "حاول مجدداً."));
  } finally {
    select.disabled = false;
  }
}

function renderProductCards() {
  const grid = document.querySelector("#products-grid");
  if (!grid) return;
  grid.replaceChildren();
  if (!products.length) {
    const note = document.createElement("p"); note.className = "dialog-note";
    note.textContent = "لم تضف منتجات بعد. استخدم زر «إضافة منتج» لبدء متجرك."; grid.append(note); return;
  }
  products.slice(0, 4).forEach((product) => {
    const card = document.createElement("article"); card.className = "product-card";
    const art = document.createElement("div"); art.className = "product-art";
    if (product.image_url) {
      const image = document.createElement("img"); image.src = product.image_url; image.alt = product.name; image.loading = "lazy"; art.append(image);
    } else {
      const label = document.createElement("span"); label.textContent = "صورة المنتج";
      const emoji = document.createElement("b"); emoji.textContent = "📦"; art.append(label, emoji);
    }
    const info = document.createElement("div"); info.className = "product-info";
    const category = document.createElement("span"); category.className = "product-category"; category.textContent = product.categories?.name || "غير مصنف";
    const title = document.createElement("strong"); title.textContent = product.name;
    const details = document.createElement("div");
    const price = document.createElement("b"); price.textContent = new Intl.NumberFormat("ar-IQ").format(product.price) + " د.ع";
    const stock = document.createElement("span"); stock.className = "stock"; stock.textContent = product.stock_quantity + " قطعة";
    details.append(price, stock); info.append(category, title, details); card.append(art, info); grid.append(card);
  });
}

async function initSeller() {
  if (!db) {
    window.location.href = "index.html";
    return;
  }
  const { data: sessionData, error: sessionError } = await db.auth.getSession();
  currentUser = sessionData?.session?.user;
  if (sessionError || !currentUser) {
    window.location.href = "index.html";
    return;
  }

  const { data: profile, error: profileError } = await db.from("profiles").select("id,full_name,role,phone").eq("id", currentUser.id).single();
  if (profileError || profile?.role !== "merchant") {
    await db.auth.signOut();
    window.location.href = "index.html";
    return;
  }

  const fallbackName = (profile.full_name || "متجري").trim();
  const slug = "store-" + currentUser.id.replace(/-/g, "").slice(0, 16);
  let { data: store, error: storeError } = await db.from("stores").select("id,name,slug,description,logo_url,phone,city").eq("owner_id", currentUser.id).maybeSingle();
  if (storeError) {
    showToast("تعذر تحميل بيانات المتجر: " + storeError.message);
    return;
  }
  if (!store) {
    const result = await db.from("stores").insert({
      owner_id: currentUser.id,
      name: fallbackName + " - متجري",
      slug,
      status: "active"
    }).select("id,name,slug,description,logo_url,phone,city").single();
    store = result.data;
    storeError = result.error;
  }
  if (storeError || !store) {
    showToast("تعذر إنشاء المتجر: " + (storeError?.message || "خطأ غير معروف"));
    return;
  }
  currentStore = store;
  document.querySelector(".profile-name strong").textContent = profile.full_name || "التاجر";
  document.querySelector(".store-chip strong").textContent = store.name;
  document.querySelector(".store-avatar").innerHTML = store.logo_url ? '<img src="' + store.logo_url + '" alt="">' : "ت";
  const profileAvatar = document.querySelector(".profile-avatar");
  if (store.logo_url) {
    profileAvatar.replaceChildren();
    const logo = document.createElement("img");
    logo.src = store.logo_url;
    logo.alt = "شعار المتجر";
    logo.className = "profile-avatar-image";
    // Inline sizing also protects the avatar if an older cached stylesheet is served.
    Object.assign(logo.style, {
      display: "block",
      width: "100%",
      height: "100%",
      maxWidth: "100%",
      maxHeight: "100%",
      objectFit: "cover",
      borderRadius: "inherit"
    });
    profileAvatar.append(logo);
    profileAvatar.setAttribute("aria-label", "الملف الشخصي للتاجر");
  } else {
    profileAvatar.textContent = (profile.full_name || "ت").trim().slice(0,1);
  }

  const { data: loadedProducts, error: productsError } = await db.from("products")
    .select("id,name,price,stock_quantity,status,category_id,image_url,categories(name)")
    .eq("store_id", currentStore.id).order("created_at", { ascending: false });
  if (productsError) {
    showToast("تعذر تحميل المنتجات: " + productsError.message);
    return;
  }
  products = loadedProducts || [];
  updateProductCounts();
  renderProductList();
  renderProductCards();
  await loadMerchantOrders();
}

initSeller();

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") sidebar.classList.remove("open");
});
