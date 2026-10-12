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
const db = window.bbenSupabase;
let toastTimer;

function showToast(text) {
  const toast = document.querySelector("#toast");
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function showView(view) {
  const titles = {overview:"نظرة عامة",products:"إدارة المنتجات",orders:"إدارة الطلبات",analytics:"المبيعات والتقارير"};
  const isOverview = view === "overview";
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
  if (view === "products") renderProductList();
  window.scrollTo({top:0,behavior:"smooth"});
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.go)));
menuToggle.addEventListener("click", () => sidebar.classList.toggle("open"));
document.querySelector("#notification-button").addEventListener("click", () => showToast("لا توجد إشعارات جديدة."));
document.querySelector("#profile-button").addEventListener("click", async () => { if (db) await db.auth.signOut(); window.location.href = "index.html"; });
document.querySelector("#help-button").addEventListener("click", () => showToast("مركز المساعدة قيد التجهيز."));

const dialog = document.querySelector("#product-dialog");
const productForm = document.querySelector("#product-form");
const productName = document.querySelector("#product-name");
const productPrice = document.querySelector("#product-price");
const productStock = document.querySelector("#product-stock");
const productCategory = document.querySelector("#product-category");
const dialogError = document.querySelector("#dialog-error");

function openProductDialog() {
  dialogError.textContent = "";
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
  if (!products.length) {
    const note = document.createElement("p");
    note.className = "dialog-note";
    note.textContent = "لا توجد منتجات محفوظة بعد. اضغط «إضافة منتج» لإضافة أول منتج إلى قاعدة البيانات.";
    list.append(note);
    return;
  }
  products.forEach((product) => {
    const row = document.createElement("div");
    row.className = "product-list-row";
    const icon = document.createElement("span");
    icon.className = "list-product-icon";
    icon.textContent = "📦";
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
    row.append(icon,info,price);
    list.append(row);
  });
}

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = productName.value.trim();
  const price = Number(productPrice.value);
  const stock = Number(productStock.value);
  if (name.length < 2 || !Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) {
    dialogError.textContent = "تأكد من اسم المنتج والسعر والكمية.";
    return;
  }
  if (!db || !currentUser || !currentStore) {
    dialogError.textContent = "تعذر التحقق من حساب التاجر أو متجره. أعد تحميل الصفحة.";
    return;
  }

  const submit = productForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  dialogError.textContent = "";
  try {
    const { data: category } = await db.from("categories").select("id").eq("name", productCategory.value).maybeSingle();
    const { data, error } = await db.from("products").insert({
      store_id: currentStore.id,
      category_id: category?.id || null,
      name,
      price,
      currency: "IQD",
      stock_quantity: stock,
      status: "active"
    }).select("id,name,price,stock_quantity,status,category_id").single();
    if (error) throw error;

    products.unshift({ ...data, categories: { name: productCategory.value } });
    updateProductCounts();
    productForm.reset();
    dialog.close();
    renderProductList();
    showView("products");
    showToast("تم حفظ المنتج في قاعدة البيانات بنجاح.");
  } catch (error) {
    dialogError.textContent = "تعذر حفظ المنتج: " + error.message;
  } finally {
    submit.disabled = false;
  }
});

function updateProductCounts() {
  const count = products.length;
  document.querySelector("#product-nav-count").textContent = String(count);
  document.querySelector("#active-products-value").innerHTML = count + ' <small>منتجاً</small>';
  const badge = document.querySelector(".demo-badge");
  if (badge) badge.innerHTML = "<span></span>متصل بقاعدة البيانات";
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

  const { data: profile, error: profileError } = await db.from("profiles").select("id,full_name,role").eq("id", currentUser.id).single();
  if (profileError || profile?.role !== "merchant") {
    await db.auth.signOut();
    window.location.href = "index.html";
    return;
  }

  const fallbackName = (profile.full_name || "متجري").trim();
  const slug = "store-" + currentUser.id.replace(/-/g, "").slice(0, 16);
  let { data: store, error: storeError } = await db.from("stores").select("id,name,slug").eq("owner_id", currentUser.id).maybeSingle();
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
    }).select("id,name,slug").single();
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

  const { data: loadedProducts, error: productsError } = await db.from("products")
    .select("id,name,price,stock_quantity,status,category_id,categories(name)")
    .eq("store_id", currentStore.id).order("created_at", { ascending: false });
  if (productsError) {
    showToast("تعذر تحميل المنتجات: " + productsError.message);
    return;
  }
  products = loadedProducts || [];
  updateProductCounts();
  renderProductList();
  const grid = document.querySelector("#products-grid");
  if (grid) {
    grid.replaceChildren();
    if (!products.length) {
      const note = document.createElement("p");
      note.className = "dialog-note";
      note.textContent = "لم تضف منتجات بعد. استخدم زر «إضافة منتج» لبدء متجرك.";
      grid.append(note);
    } else {
      products.slice(0, 4).forEach((product) => {
        const card = document.createElement("article");
        card.className = "product-card";
        const art = document.createElement("div");
        art.className = "product-art";
        const label = document.createElement("span");
        label.textContent = "منتج محفوظ";
        const emoji = document.createElement("b");
        emoji.textContent = "📦";
        art.append(label, emoji);
        const info = document.createElement("div");
        info.className = "product-info";
        const category = document.createElement("span");
        category.className = "product-category";
        category.textContent = product.categories?.name || "غير مصنف";
        const title = document.createElement("strong");
        title.textContent = product.name;
        const details = document.createElement("div");
        const price = document.createElement("b");
        price.textContent = new Intl.NumberFormat("ar-IQ").format(product.price) + " د.ع";
        const stock = document.createElement("span");
        stock.className = "stock";
        stock.textContent = product.stock_quantity + " قطعة";
        details.append(price, stock);
        info.append(category, title, details);
        card.append(art, info);
        grid.append(card);
      });
    }
  }
}

initSeller();

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") sidebar.classList.remove("open");
});
