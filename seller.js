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
let demoProducts = [];
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
document.querySelector("#notification-button").addEventListener("click", () => showToast("لا توجد إشعارات جديدة في المعاينة."));
document.querySelector("#profile-button").addEventListener("click", () => showToast("إعدادات الحساب ستُضاف في مرحلة لاحقة."));
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
  if (!demoProducts.length) {
    const note = document.createElement("p");
    note.className = "dialog-note";
    note.textContent = "ما أضفت منتجات تجريبية بعد. اضغط «إضافة منتج» لتجربة النموذج.";
    list.append(note);
    return;
  }
  demoProducts.forEach((product) => {
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
    detail.textContent = product.category + " · الكمية: " + product.stock;
    info.append(name,detail);
    const price = document.createElement("span");
    price.className = "list-price";
    price.textContent = new Intl.NumberFormat("ar-IQ").format(product.price) + " د.ع";
    row.append(icon,info,price);
    list.append(row);
  });
}

productForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = productName.value.trim();
  const price = Number(productPrice.value);
  const stock = Number(productStock.value);
  if (name.length < 2 || !Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) {
    dialogError.textContent = "تأكد من اسم المنتج والسعر والكمية.";
    return;
  }
  demoProducts.unshift({name,price,stock,category:productCategory.value});
  const count = 4 + demoProducts.length;
  document.querySelector("#product-nav-count").textContent = String(count);
  document.querySelector("#active-products-value").innerHTML = count + ' <small>منتجاً</small>';
  productForm.reset();
  dialog.close();
  renderProductList();
  showView("products");
  showToast("تمت إضافة المنتج للمعاينة فقط، ولم يُحفظ في قاعدة بيانات.");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") sidebar.classList.remove("open");
});
