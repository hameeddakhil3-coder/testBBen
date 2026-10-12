const db = window.bbenSupabase;
const $ = (selector) => document.querySelector(selector);
let allProducts = [];
let allCategories = [];
let activeCategory = "";
let currentUser = null;
let currentRole = null;
let cartItems = [];
let toastTimer;

const money = (value) => new Intl.NumberFormat("ar-IQ").format(Number(value) || 0) + " د.ع";
const safeText = (value) => String(value ?? "");
function toast(text) {
  const el = $("#market-toast");
  el.textContent = text; el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
}
function imageOrPlaceholder(url, name = "المنتج") {
  if (url) {
    const img = document.createElement("img");
    img.src = url; img.alt = name; img.loading = "lazy";
    img.addEventListener("error", () => {
      const parent = img.parentElement;
      if (parent) parent.replaceChildren(makePlaceholder());
    }, { once: true });
    return img;
  }
  return makePlaceholder();
}
function makePlaceholder() {
  const box = document.createElement("div"); box.className = "image-placeholder";
  const emoji = document.createElement("b"); emoji.textContent = "📦";
  const label = document.createElement("span"); label.textContent = "لا توجد صورة";
  box.append(emoji, label); return box;
}
function renderCategories() {
  const host = $("#category-list"); host.replaceChildren();
  const categories = [{ id: "", name: "الكل" }, ...allCategories];
  categories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = "category-chip" + (activeCategory === category.id ? " active" : "");
    button.dataset.category = category.id; button.textContent = category.name;
    button.addEventListener("click", () => { activeCategory = category.id; renderCategories(); renderProducts(); });
    host.append(button);
  });
}
function visibleProducts() {
  const query = $("#search-input").value.trim().toLocaleLowerCase("ar");
  let items = allProducts.filter((p) => {
    const categoryMatch = !activeCategory || p.category_id === activeCategory;
    const haystack = [p.name, p.description, p.categories?.name, p.stores?.name, p.stores?.city].filter(Boolean).join(" ").toLocaleLowerCase("ar");
    return categoryMatch && (!query || haystack.includes(query));
  });
  const sort = $("#sort-select").value;
  if (sort === "price-asc") items.sort((a,b) => Number(a.price)-Number(b.price));
  else if (sort === "price-desc") items.sort((a,b) => Number(b.price)-Number(a.price));
  else if (sort === "name") items.sort((a,b) => a.name.localeCompare(b.name, "ar"));
  else items.sort((a,b) => new Date(b.created_at)-new Date(a.created_at));
  return items;
}
function renderProducts() {
  const grid = $("#product-grid"); grid.replaceChildren();
  const items = visibleProducts();
  $("#results-summary").textContent = items.length + " منتج";
  $("#clear-search").hidden = !$("#search-input").value;
  const message = $("#market-message");
  if (!items.length) {
    message.textContent = allProducts.length ? "لم نعثر على منتجات تطابق بحثك. جرّب كلمة أخرى أو غيّر التصنيف." : "لا توجد منتجات منشورة للبيع حالياً. عندما يضيف التجار منتجات نشطة ستظهر هنا.";
    message.classList.remove("hidden"); message.classList.toggle("error", !allProducts.length && message.dataset.error === "true");
    return;
  }
  message.textContent = ""; message.classList.add("hidden"); message.classList.remove("error");
  items.forEach((product) => {
    const card = document.createElement("article"); card.className = "market-card";
    const image = document.createElement("button"); image.type = "button"; image.className = "market-card-image"; image.setAttribute("aria-label", "عرض تفاصيل " + product.name);
    image.append(imageOrPlaceholder(product.image_url, product.name));
    const storeBadge = document.createElement("span"); storeBadge.className = "store-badge";
    if (product.stores?.logo_url) {
      const logo = document.createElement("img"); logo.src = product.stores.logo_url; logo.alt = ""; storeBadge.append(logo);
    }
    const storeName = document.createElement("span"); storeName.textContent = product.stores?.name || "متجر BBen"; storeBadge.append(storeName); image.append(storeBadge);
    image.addEventListener("click", () => showProductDetails(product));
    const body = document.createElement("div"); body.className = "market-card-body";
    const category = document.createElement("span"); category.className = "market-card-category"; category.textContent = product.categories?.name || "أخرى";
    const title = document.createElement("strong"); title.className = "market-card-title"; title.textContent = product.name;
    const store = document.createElement("p"); store.className = "market-card-store"; store.textContent = product.stores?.city ? product.stores.name + " · " + product.stores.city : product.stores?.name || "متجر BBen";
    const bottom = document.createElement("div"); bottom.className = "market-card-bottom";
    const price = document.createElement("span"); price.className = "market-price"; price.textContent = money(product.price);
    const actions = document.createElement("div"); actions.className = "market-card-actions";
    const detailButton = document.createElement("button"); detailButton.type = "button"; detailButton.className = "card-icon-button"; detailButton.textContent = "↗"; detailButton.setAttribute("aria-label", "تفاصيل المنتج"); detailButton.addEventListener("click", () => showProductDetails(product));
    const addButton = document.createElement("button"); addButton.type = "button"; addButton.className = "card-add-button"; addButton.textContent = "+"; addButton.setAttribute("aria-label", "أضف إلى السلة");
    addButton.disabled = Number(product.stock_quantity) <= 0; addButton.title = addButton.disabled ? "نفدت الكمية" : "أضف إلى السلة";
    addButton.addEventListener("click", () => addToCart(product));
    actions.append(detailButton, addButton); bottom.append(price, actions);
    const stock = document.createElement("div"); stock.className = "stock-label" + (Number(product.stock_quantity) <= 0 ? " out" : "");
    stock.textContent = Number(product.stock_quantity) > 0 ? "متوفر · " + product.stock_quantity + " قطعة" : "نفدت الكمية";
    body.append(category, title, store, bottom, stock); card.append(image, body); grid.append(card);
  });
}
function showProductDetails(product) {
  const host = $("#dialog-product-content"); host.replaceChildren();
  const layout = document.createElement("div"); layout.className = "dialog-product-layout";
  const image = document.createElement("div"); image.className = "dialog-product-image"; image.append(imageOrPlaceholder(product.image_url, product.name));
  const info = document.createElement("div"); info.className = "dialog-product-info";
  const category = document.createElement("span"); category.className = "market-card-category"; category.textContent = product.categories?.name || "أخرى";
  const title = document.createElement("h2"); title.textContent = product.name;
  const price = document.createElement("div"); price.className = "dialog-product-price"; price.textContent = money(product.price);
  const description = document.createElement("p"); description.textContent = product.description || "لا يوجد وصف إضافي لهذا المنتج حالياً.";
  const store = document.createElement("div"); store.className = "dialog-store";
  if (product.stores?.logo_url) { const logo = document.createElement("img"); logo.src = product.stores.logo_url; logo.alt = ""; store.append(logo); }
  const storeName = document.createElement("span"); storeName.textContent = "المتجر: " + (product.stores?.name || "متجر BBen") + (product.stores?.city ? " · " + product.stores.city : ""); store.append(storeName);
  const stock = document.createElement("p"); stock.textContent = Number(product.stock_quantity) > 0 ? "الكمية المتاحة: " + product.stock_quantity : "نفدت الكمية حالياً.";
  const add = document.createElement("button"); add.type = "button"; add.className = "primary-market-button dialog-add"; add.textContent = Number(product.stock_quantity) > 0 ? "إضافة إلى السلة" : "غير متوفر"; add.disabled = Number(product.stock_quantity) <= 0; add.addEventListener("click", () => addToCart(product));
  info.append(category, title, price, description, store, stock, add); layout.append(image, info); host.append(layout);
  $("#product-dialog").showModal();
}
async function ensureCustomer() {
  if (!db || !currentUser) {
    toast("سجّل الدخول بحساب مشتري أولاً لإضافة المنتجات إلى السلة.");
    window.location.href = "index.html";
    return false;
  }
  if (currentRole !== "customer") {
    toast("السلة متاحة لحساب المشتري. سنعيدك إلى لوحة التاجر.");
    if (currentRole === "merchant") window.location.href = "seller.html";
    return false;
  }
  return true;
}
async function addToCart(product) {
  if (!(await ensureCustomer())) return;
  try {
    const existing = cartItems.find((item) => item.product_id === product.id);
    const nextQuantity = (existing?.quantity || 0) + 1;
    if (nextQuantity > Number(product.stock_quantity)) { toast("لا توجد كمية إضافية متاحة من هذا المنتج."); return; }
    let result;
    if (existing) {
      result = await db.from("cart_items").update({ quantity: nextQuantity }).eq("id", existing.id).eq("customer_id", currentUser.id);
    } else {
      result = await db.from("cart_items").insert({ customer_id: currentUser.id, product_id: product.id, quantity: 1 });
    }
    if (result.error) throw result.error;
    await loadCart();
    toast("تمت إضافة المنتج إلى سلة التسوق.");
  } catch (error) {
    toast("تعذرت إضافة المنتج: " + (error.message || "حاول مجدداً."));
  }
}
async function loadCart() {
  if (!db || !currentUser || currentRole !== "customer") { cartItems = []; $("#cart-count").textContent = "0"; return; }
  const { data, error } = await db.from("cart_items")
    .select("id,customer_id,product_id,quantity,products(id,name,price,currency,stock_quantity,image_url,store_id,stores(name))")
    .eq("customer_id", currentUser.id).order("created_at", { ascending: false });
  if (error) { console.warn("Cart load failed:", error.message); return; }
  cartItems = (data || []).filter((item) => item.products);
  $("#cart-count").textContent = String(cartItems.reduce((sum,item) => sum + Number(item.quantity || 0),0));
}
function renderCart() {
  $("#checkout-button").disabled = true;
  const host = $("#cart-content"); host.replaceChildren();
  if (!currentUser || currentRole !== "customer") {
    const p = document.createElement("p"); p.className = "market-message"; p.textContent = "سجّل الدخول بحساب مشتري لعرض سلتك المحفوظة."; host.append(p);
    $("#cart-total").replaceChildren(); return;
  }
  if (!cartItems.length) {
    const p = document.createElement("p"); p.className = "market-message"; p.textContent = "سلتك فارغة حالياً. أضف المنتجات التي تعجبك من السوق."; host.append(p);
    $("#cart-total").replaceChildren(); return;
  }
  let total = 0;
  cartItems.forEach((item) => {
    const product = item.products; const quantity = Number(item.quantity); total += Number(product.price) * quantity;
    const row = document.createElement("div"); row.className = "cart-row";
    row.append(imageOrPlaceholder(product.image_url, product.name));
    const info = document.createElement("div");
    const name = document.createElement("strong"); name.textContent = product.name;
    const price = document.createElement("small"); price.textContent = money(product.price);
    const controls = document.createElement("div"); controls.className = "cart-row-controls";
    const minus = document.createElement("button"); minus.type = "button"; minus.textContent = "−"; minus.setAttribute("aria-label", "تقليل الكمية"); minus.addEventListener("click", () => changeCartQuantity(item, quantity - 1));
    const count = document.createElement("span"); count.textContent = String(quantity); count.style.fontSize = "11px";
    const plus = document.createElement("button"); plus.type = "button"; plus.textContent = "+"; plus.setAttribute("aria-label", "زيادة الكمية"); plus.disabled = quantity >= Number(product.stock_quantity); plus.addEventListener("click", () => changeCartQuantity(item, quantity + 1));
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "remove-cart"; remove.textContent = "حذف"; remove.addEventListener("click", () => changeCartQuantity(item, 0));
    controls.append(minus, count, plus, remove); info.append(name, price, controls);
    const subtotal = document.createElement("span"); subtotal.className = "cart-row-price"; subtotal.textContent = money(Number(product.price) * quantity);
    row.append(info, subtotal); host.append(row);
  });
  const label = document.createElement("span"); label.textContent = "المجموع التقريبي";
  const value = document.createElement("strong"); value.textContent = money(total);
  $("#cart-total").replaceChildren(label, value);
  $("#checkout-button").disabled = false;
}
async function changeCartQuantity(item, quantity) {
  try {
    let result;
    if (quantity <= 0) result = await db.from("cart_items").delete().eq("id", item.id).eq("customer_id", currentUser.id);
    else {
      if (quantity > Number(item.products.stock_quantity)) { toast("تجاوزت الكمية المتوفرة."); return; }
      result = await db.from("cart_items").update({ quantity }).eq("id", item.id).eq("customer_id", currentUser.id);
    }
    if (result.error) throw result.error;
    await loadCart(); renderCart();
  } catch (error) { toast("تعذر تحديث السلة: " + error.message); }
}
async function openCart() {
  await loadCart(); renderCart(); $("#cart-dialog").showModal();
}
const orderStatusLabels = {
  pending: { label: "قيد الانتظار", className: "pending" },
  processing: { label: "قيد التجهيز", className: "processing" },
  shipped: { label: "قيد التوصيل", className: "shipped" },
  delivered: { label: "مكتمل", className: "delivered" },
  cancelled: { label: "ملغي", className: "cancelled" }
};
async function loadOrderHistory() {
  const host = $("#order-history-list");
  const refresh = $("#refresh-orders-button");
  host.replaceChildren();
  if (!currentUser || currentRole !== "customer") {
    const note = document.createElement("p");
    note.className = "market-message";
    note.textContent = "سجّل الدخول بحساب مشتري لعرض طلباتك.";
    host.append(note);
    return;
  }
  refresh.disabled = true;
  refresh.textContent = "جارٍ التحديث...";
  const loading = document.createElement("p");
  loading.className = "market-message";
  loading.textContent = "جارٍ تحميل طلباتك...";
  host.append(loading);
  try {
    const { data, error } = await db.from("orders")
      .select("id,order_number,status,customer_name,customer_phone,shipping_address,notes,created_at,order_items(id,store_id,product_name,unit_price,quantity,line_total)")
      .eq("customer_id", currentUser.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    host.replaceChildren();
    const orders = data || [];
    if (!orders.length) {
      const empty = document.createElement("p");
      empty.className = "market-message";
      empty.textContent = "لا توجد طلبات مسجلة حتى الآن. ستظهر طلباتك هنا بعد إتمام الشراء.";
      host.append(empty);
      return;
    }
    orders.forEach((order) => {
      const card = document.createElement("article");
      card.className = "order-history-card";
      const head = document.createElement("div");
      head.className = "order-history-card-head";
      const identity = document.createElement("div");
      const number = document.createElement("strong");
      number.textContent = "#BB-" + order.order_number;
      const date = document.createElement("small");
      const parsedDate = order.created_at ? new Date(order.created_at) : null;
      date.textContent = parsedDate && !Number.isNaN(parsedDate.getTime())
        ? parsedDate.toLocaleString("ar-IQ", { dateStyle: "medium", timeStyle: "short" })
        : "تاريخ الطلب غير متاح";
      identity.append(number, date);
      const statusInfo = orderStatusLabels[order.status] || { label: order.status || "غير معروف", className: "unknown" };
      const status = document.createElement("span");
      status.className = "order-history-status " + statusInfo.className;
      status.textContent = statusInfo.label;
      head.append(identity, status);
      const itemsHost = document.createElement("div");
      itemsHost.className = "order-history-items";
      let total = 0;
      (order.order_items || []).forEach((item) => {
        const row = document.createElement("div");
        row.className = "order-history-item";
        const name = document.createElement("span");
        name.textContent = item.product_name || "منتج";
        const quantity = document.createElement("small");
        quantity.textContent = "الكمية: " + Number(item.quantity || 0);
        const price = document.createElement("strong");
        const lineTotal = item.line_total == null ? Number(item.unit_price || 0) * Number(item.quantity || 0) : Number(item.line_total);
        total += lineTotal;
        price.textContent = money(lineTotal);
        const details = document.createElement("div");
        details.className = "order-history-item-details";
        details.append(name, quantity);
        row.append(details, price);
        itemsHost.append(row);
      });
      const footer = document.createElement("div");
      footer.className = "order-history-card-footer";
      const address = document.createElement("span");
      address.textContent = "عنوان التوصيل: " + (order.shipping_address || "غير مسجل");
      const totalLabel = document.createElement("strong");
      totalLabel.textContent = "الإجمالي: " + money(total);
      footer.append(address, totalLabel);
      card.append(head, itemsHost, footer);
      if (order.notes) {
        const note = document.createElement("p");
        note.className = "order-history-note";
        note.textContent = "ملاحظاتك: " + order.notes;
        card.append(note);
      }
      host.append(card);
    });
  } catch (error) {
    console.error("Order history load failed:", error);
    host.replaceChildren();
    const problem = document.createElement("p");
    problem.className = "market-message error";
    problem.textContent = "تعذر تحميل طلباتك: " + (error.message || "حاول مجدداً.");
    host.append(problem);
  } finally {
    refresh.disabled = false;
    refresh.textContent = "تحديث الطلبات ↻";
  }
}
async function openOrderHistory() {
  if (!currentUser || currentRole !== "customer") {
    toast("سجّل الدخول بحساب مشتري أولاً لعرض طلباتك.");
    window.location.href = "index.html";
    return;
  }
  await loadOrderHistory();
  $("#order-history-dialog").showModal();
}
async function openCheckout() {
  if (!(await ensureCustomer())) return;
  await loadCart();
  renderCart();
  if (!cartItems.length) { toast("أضف منتجاً واحداً على الأقل قبل إتمام الطلب."); return; }
  $("#cart-dialog").close();
  $("#checkout-form").reset();
  $("#checkout-error").textContent = "";
  $("#checkout-form").hidden = false;
  $("#checkout-success").hidden = true;
  if (!$("#checkout-name").value.trim()) $("#checkout-name").value = $("#account-label").textContent === "حسابي" ? "" : $("#account-label").textContent;
  $("#checkout-dialog").showModal();
}
async function submitCheckout(event) {
  event.preventDefault();
  if (!(await ensureCustomer())) return;
  const button = $("#confirm-order-button");
  const errorBox = $("#checkout-error");
  errorBox.textContent = "";
  button.disabled = true;
  button.textContent = "جارٍ تسجيل الطلب...";
  try {
    const form = new FormData($("#checkout-form"));
    const { data, error } = await db.rpc("checkout_cart", {
      p_customer_name: String(form.get("customerName") || "").trim(),
      p_customer_phone: String(form.get("customerPhone") || "").trim(),
      p_shipping_address: String(form.get("shippingAddress") || "").trim(),
      p_notes: String(form.get("notes") || "").trim() || null
    });
    if (error) throw error;
    if (!data || !Array.isArray(data.orders) || !data.orders.length) throw new Error("لم تصلنا بيانات تأكيد الطلب. تحقق من الطلبات قبل إعادة المحاولة.");
    $("#checkout-success-number").textContent = "رقم الطلب: " + data.orders.map((order) => "#BB-" + order.order_number).join("، ");
    $("#checkout-success-total").textContent = "الإجمالي الكلي: " + money(data.total);
    $("#checkout-form").hidden = true;
    $("#checkout-success").hidden = false;
    await initMarket();
  } catch (error) {
    console.error("Checkout failed:", error);
    errorBox.textContent = error.message || "تعذر تسجيل الطلب. يرجى المحاولة مرة أخرى.";
  } finally {
    button.disabled = false;
    button.textContent = "تأكيد الطلب";
  }
}
async function initMarket() {
  $("#market-message").textContent = "جارٍ تحميل المنتجات...";
  if (!db) {
    $("#market-message").textContent = "تعذر الاتصال بخدمة السوق. أعد تحميل الصفحة.";
    $("#market-message").classList.add("error"); return;
  }
  try {
    const sessionResult = await db.auth.getSession();
    currentUser = sessionResult.data?.session?.user || null;
    if (currentUser) {
      const profileResult = await db.from("profiles").select("role,full_name").eq("id", currentUser.id).maybeSingle();
      currentRole = profileResult.data?.role || null;
      if (currentRole === "merchant") { window.location.href = "seller.html"; return; }
      $("#account-label").textContent = profileResult.data?.full_name || "حسابي";
      $("#account-button").title = "الملف الشخصي";
    }
    const [categoryResult, productResult] = await Promise.all([
      db.from("categories").select("id,name,slug").order("name"),
      db.from("products").select("id,name,description,price,currency,stock_quantity,image_url,status,category_id,created_at,categories(name),stores(id,name,logo_url,city,status)").eq("status","active").gt("stock_quantity",0).order("created_at",{ascending:false})
    ]);
    if (categoryResult.error) throw categoryResult.error;
    if (productResult.error) throw productResult.error;
    allCategories = categoryResult.data || [];
    allProducts = (productResult.data || []).filter((p) => p.stores?.status === "active");
    renderCategories(); renderProducts(); await loadCart();
  } catch (error) {
    console.error("Market load failed:", error);
    $("#market-message").textContent = "تعذر تحميل المنتجات من قاعدة البيانات: " + (error.message || "خطأ غير معروف");
    $("#market-message").classList.remove("hidden"); $("#market-message").classList.add("error");
  }
}
$("#search-input").addEventListener("input", renderProducts);
$("#clear-search").addEventListener("click", () => { $("#search-input").value = ""; renderProducts(); $("#search-input").focus(); });
$("#sort-select").addEventListener("change", renderProducts);
$("#browse-button").addEventListener("click", () => $("#products-section").scrollIntoView({ behavior: "smooth" }));
$("#show-all-categories").addEventListener("click", () => { activeCategory = ""; renderCategories(); renderProducts(); });
$("#account-button").addEventListener("click", async () => {
  if (currentUser && currentRole === "customer") { toast("أنت مسجّل الدخول بحساب مشتري."); return; }
  window.location.href = "index.html";
});
$("#cart-button").addEventListener("click", openCart);
$("#orders-button").addEventListener("click", openOrderHistory);
$("#refresh-orders-button").addEventListener("click", loadOrderHistory);
$("#close-orders-dialog").addEventListener("click", () => $("#order-history-dialog").close());
$("#view-orders-after-checkout").addEventListener("click", () => { $("#checkout-dialog").close(); openOrderHistory(); });
$("#checkout-button").addEventListener("click", openCheckout);
$("#checkout-form").addEventListener("submit", submitCheckout);
$("#close-checkout-dialog").addEventListener("click", () => $("#checkout-dialog").close());
$("#finish-checkout").addEventListener("click", () => $("#checkout-dialog").close());
$("#close-product-dialog").addEventListener("click", () => $("#product-dialog").close());
$("#close-cart-dialog").addEventListener("click", () => $("#cart-dialog").close());
$("#continue-shopping").addEventListener("click", () => $("#cart-dialog").close());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { if ($("#product-dialog").open) $("#product-dialog").close(); if ($("#cart-dialog").open) $("#cart-dialog").close(); if ($("#checkout-dialog").open) $("#checkout-dialog").close(); if ($("#order-history-dialog").open) $("#order-history-dialog").close(); }
});
initMarket();