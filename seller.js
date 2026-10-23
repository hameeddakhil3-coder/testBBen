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
  chat: document.querySelector("#chat-view"),
  analytics: document.querySelector("#analytics-view")
};
let products = [];
let currentUser = null;
let currentStore = null;
let merchantOrders = [];
let orderFilter = "all";
let activeProductsOnly = false;
const db = globalThis.bbenSupabase;
let toastTimer;
let merchantChatRefreshTimer = null;
let merchantChatRealtimeChannel = null;
let merchantMessagesRealtimeChannel = null;


async function loadMerchantNotifications(){
 const host=document.querySelector("#merchant-notifications-list");
 host.replaceChildren();
 if(!currentUser){const p=document.createElement("p");p.textContent="سجّل الدخول لعرض الإشعارات.";host.append(p);return;}
 const {data,error}=await db.from("notifications").select("id,title,body,target_url,created_at,read_at,user_id,target_role").or("user_id.eq."+currentUser.id+",and(user_id.is.null,target_role.eq.merchant)").order("created_at",{ascending:false}).limit(50);
 if(error){const p=document.createElement("p");p.textContent="تعذر تحميل الإشعارات.";host.append(p);return;}
 if(!data?.length){const p=document.createElement("p");p.textContent="لا توجد إشعارات حالياً.";host.append(p);return;}
 data.forEach(n=>{
  const card=document.createElement("article");card.className="notice-box"+(n.read_at?"":" notification-unread");
  const title=document.createElement("strong");title.textContent=n.title;
  const body=document.createElement("p");body.textContent=n.body||"";
  const time=document.createElement("small");time.textContent=new Date(n.created_at).toLocaleString("ar-IQ",{dateStyle:"medium",timeStyle:"short"});
  card.append(title,body,time);
  if(!n.read_at){const button=document.createElement("button");button.type="button";button.className="secondary-button";button.textContent="تحديد كمقروء";button.addEventListener("click",async()=>{button.disabled=true;const {error:updateError}=await db.from("notifications").update({read_at:new Date().toISOString()}).eq("id",n.id);if(updateError){showToast("تعذر تحديث الإشعار.");button.disabled=false;return;}button.remove();card.classList.remove("notification-unread");await refreshMerchantNotificationBadge();});card.append(button);}
  if(n.target_url&&!/^(?:https?:)?\/\//i.test(n.target_url)&&!n.target_url.startsWith("..")&&!/^javascript:/i.test(n.target_url)){const link=document.createElement("a");link.href=n.target_url;link.textContent="فتح الطلب";link.className="notification-open-link";link.addEventListener("click",async(event)=>{if(!n.read_at){event.preventDefault();const {error:updateError}=await db.from("notifications").update({read_at:new Date().toISOString()}).eq("id",n.id);if(updateError){showToast("تعذر تحديث الإشعار.");return;}await refreshMerchantNotificationBadge();globalThis.location.href=link.href;}});card.append(link);}
  host.append(card);
 });
}

async function refreshMerchantNotificationBadge(){
 const badge=document.querySelector("#notification-button i");
 if(!badge||!currentUser||!db)return;
 try{
  const {count,error}=await db.from("notifications").select("id",{count:"exact",head:true})
   .or("user_id.eq."+currentUser.id+",and(user_id.is.null,target_role.eq.merchant)")
   .is("read_at",null);
  if(error)throw error;
  badge.hidden=!count;
  document.querySelector("#notification-button").setAttribute("aria-label",count?("الإشعارات، "+count+" غير مقروء"):"الإشعارات");
  document.querySelector("#notification-button").title=count?("إشعارات غير مقروءة: "+count):"الإشعارات";
 }catch(error){console.warn("Notification count failed:",error);}
}

function showToast(text) {
  const toast = document.querySelector("#toast");
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function showView(view, options = {}) {
  const titles = {overview:"نظرة عامة",products:"إدارة المنتجات",orders:"إدارة الطلبات",chat:"رسائل الزبائن",analytics:"المبيعات والتقارير"};
  const isOverview = view === "overview";
  if (view === "products") activeProductsOnly = options.activeOnly === true;
  if (view === "orders") orderFilter = options.pendingOnly === true ? "pending" : "all";
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
  if (view === "chat" && currentStore) {
    loadMerchantChats();
    startMerchantChatAutoRefresh();
  } else {
    stopMerchantChatAutoRefresh();
  }
  globalThis.scrollTo({top:0,behavior:"smooth"});
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
document.querySelector("#notification-button").addEventListener("click", async () => { await loadMerchantNotifications(); document.querySelector("#merchant-notifications-dialog").showModal(); await refreshMerchantNotificationBadge(); });
document.querySelector("#close-merchant-notifications").addEventListener("click", () => document.querySelector("#merchant-notifications-dialog").close());
document.querySelector("#refresh-orders-button").addEventListener("click", loadMerchantOrders);
document.querySelector("#profile-button").addEventListener("click", () => { globalThis.location.href = "merchant-profile.html"; });
document.querySelector("#view-public-store").addEventListener("click", () => { if (currentStore?.id) globalThis.location.href = "market.html?store_id=" + encodeURIComponent(currentStore.id); else showToast("تعذر تحديد متجر حسابك."); });
document.querySelector("#logout-button").addEventListener("click", async () => { if (db) await db.auth.signOut(); globalThis.location.href = "index.html"; });
document.querySelector("#help-button").addEventListener("click", () => showToast("مركز المساعدة قيد التجهيز."));

const dialog = document.querySelector("#product-dialog");
const productForm = document.querySelector("#product-form");
const productName = document.querySelector("#product-name");
const productPrice = document.querySelector("#product-price");
const productCommissionRate = document.querySelector("#product-commission-rate");
const productCommissionAmount = document.querySelector("#product-commission-amount");
const productMerchantNet = document.querySelector("#product-merchant-net");
let currentPlatformCommissionRate = null;
const formatIQD = value => new Intl.NumberFormat("ar-IQ", {maximumFractionDigits:2}).format(value) + " د.ع";
function renderProductCommissionPreview(){
  const price = Number(productPrice.value);
  if(productCommissionRate) productCommissionRate.textContent = currentPlatformCommissionRate === null ? "غير متاح" : new Intl.NumberFormat("ar-IQ",{maximumFractionDigits:2}).format(currentPlatformCommissionRate)+"%";
  if(!Number.isFinite(price)||price<=0||currentPlatformCommissionRate===null){
    if(productCommissionAmount) productCommissionAmount.textContent="—";
    if(productMerchantNet) productMerchantNet.textContent="—";
    return;
  }
  const commission = Math.round((price * currentPlatformCommissionRate / 100)*100)/100;
  if(productCommissionAmount) productCommissionAmount.textContent=formatIQD(commission);
  if(productMerchantNet) productMerchantNet.textContent=formatIQD(price-commission);
}
async function loadProductCommissionRate(){
  if(productCommissionRate) productCommissionRate.textContent="جارٍ التحميل...";
  try{
    const {data,error}=await db.rpc("get_platform_commission_rate");
    if(error) throw error;
    const rate=Number(data);
    if(!Number.isFinite(rate)||rate<0||rate>20) throw new Error("نسبة العمولة غير صالحة");
    currentPlatformCommissionRate=rate;
  }catch{
    currentPlatformCommissionRate=null;
    if(productCommissionRate) productCommissionRate.textContent="تعذر تحميل النسبة";
    if(dialogError) dialogError.textContent="تعذر تحميل نسبة عمولة المنصة؛ لن يتم عرض تقدير حتى يتوفر الاتصال.";
  }
  renderProductCommissionPreview();
}
productPrice.addEventListener("input",renderProductCommissionPreview);

const productStock = document.querySelector("#product-stock");
const productStatus = document.querySelector("#product-status");
const productCategory = document.querySelector("#product-category");
const dialogError = document.querySelector("#dialog-error");
const productImage = document.querySelector("#product-image");
const productImagesPreview = document.querySelector("#product-images-preview");
let editingProductId = null;
let existingProductImages = [];
let removedProductImageIds = new Set();
let selectedProductFiles = [];
function renderProductImagePreviews() {
  productImagesPreview.replaceChildren();
  const keptImages = existingProductImages.filter((image) => !removedProductImageIds.has(image.id));
  keptImages.forEach((image, index) => {
    const item = document.createElement("div"); item.className = "product-image-preview-item";
    const img = document.createElement("img"); img.src = image.image_url; img.alt = "صورة محفوظة للمنتج " + (index + 1);
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "remove-product-image";
    remove.textContent = "×"; remove.setAttribute("aria-label", "إزالة الصورة");
    remove.addEventListener("click", () => { removedProductImageIds.add(image.id); renderProductImagePreviews(); });
    item.append(img, remove); productImagesPreview.append(item);
  });
  selectedProductFiles.forEach((file, index) => {
    const item = document.createElement("div"); item.className = "product-image-preview-item is-new";
    const img = document.createElement("img"); img.src = URL.createObjectURL(file); img.alt = "صورة جديدة " + (index + 1);
    const label = document.createElement("small"); label.textContent = "جديدة";
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "remove-product-image";
    remove.textContent = "×"; remove.setAttribute("aria-label", "إزالة الصورة الجديدة");
    remove.addEventListener("click", () => { selectedProductFiles.splice(index, 1); renderProductImagePreviews(); });
    item.append(img, label, remove); productImagesPreview.append(item);
  });
  productImagesPreview.classList.toggle("hidden", !keptImages.length && !selectedProductFiles.length);
}
document.querySelector("#add-more-product-images").addEventListener("click", () => productImage.click());
productImage.addEventListener("change", () => {
  const files = [...(productImage.files || [])];
  productImage.value = "";
  if (files.some((file) => !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024)) {
    showToast("يجب أن تكون كل صورة صالحة وألا يتجاوز حجمها 5 ميغابايت."); return;
  }
  const keptCount = existingProductImages.filter((image) => !removedProductImageIds.has(image.id)).length;
  if (keptCount + selectedProductFiles.length + files.length > 8) {
    showToast("يمكن للمنتج أن يحتوي على 8 صور كحد أقصى."); return;
  }
  selectedProductFiles = [...selectedProductFiles, ...files];
  renderProductImagePreviews();
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

async function openProductDialog(product = null) {
  loadProductCommissionRate();
  editingProductId = product?.id || null; dialogError.textContent = ""; productForm.reset();
  productStatus.value = product?.status || "active"; existingProductImages = [];
  removedProductImageIds = new Set(); selectedProductFiles = [];
  productImagesPreview.replaceChildren(); productImagesPreview.classList.add("hidden");
  document.querySelector("#product-dialog-title").textContent = product ? "تعديل المنتج" : "إضافة منتج";
  productForm.querySelector('button[type="submit"]').textContent = product ? "حفظ التعديلات" : "حفظ المنتج";
  if (product) {
    productName.value = product.name || ""; productPrice.value = product.price ?? "";
    productStock.value = product.stock_quantity ?? 0; productStatus.value = product.status || "active";
    productCategory.value = product.categories?.name || "أخرى";
    try {
      const { data, error } = await db.from("product_images").select("id,image_url,sort_order,created_at")
        .eq("product_id", product.id).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
      if (error) throw error;
      existingProductImages = data || [];
      if (!existingProductImages.length && product.image_url) existingProductImages = [{ id: "legacy-" + product.id, image_url: product.image_url, sort_order: 0, legacy: true }];
    } catch (error) { dialogError.textContent = "تعذر تحميل صور المنتج: " + error.message; showToast("تعذر تحميل صور المنتج."); return; }
    renderProductImagePreviews();
  }
  if (typeof dialog.showModal === "function") dialog.showModal();
  else showToast("المتصفح لا يدعم نافذة الإضافة؛ جرّب متصفحاً أحدث.");
}
document.querySelector("#add-product-top").addEventListener("click", () => openProductDialog());
document.querySelector("#quick-add-product").addEventListener("click", () => openProductDialog());
document.querySelector("#add-product-view").addEventListener("click", () => openProductDialog());
document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());
document.querySelector("#cancel-dialog").addEventListener("click", () => dialog.close());

async function handleDeleteProduct(product, button) {
  if (!currentStore || !db) return;
  const confirmed = globalThis.confirm('هل تريد حذف المنتج «' + product.name + '»؟ إذا كان مرتبطاً بطلبات أو محادثات أو سلال شراء، فسيتم أرشفته بدلاً من حذفه للحفاظ على السجلات السابقة.');
  if (!confirmed) return;
  button.disabled = true;
  try {
    const checks = await Promise.all([
      db.from("order_items").select("id", { count: "exact", head: true }).eq("product_id", product.id),
      db.from("chat_conversations").select("id", { count: "exact", head: true }).eq("product_id", product.id),
      db.from("cart_items").select("id", { count: "exact", head: true }).eq("product_id", product.id)
    ]);
    const failed = checks.find((result) => result.error);
    if (failed) throw failed.error;
    const hasHistory = checks.some((result) => (result.count || 0) > 0);
    if (hasHistory) {
      const { data, error } = await db.from("products")
        .update({ status: "archived" })
        .eq("id", product.id)
        .eq("store_id", currentStore.id)
        .select("id,status").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("لم يتم العثور على المنتج أو لا تملك صلاحية تعديله.");
      products = products.map((item) => item.id === product.id ? { ...item, status: "archived" } : item);
      showToast("للمنتج سجلات مرتبطة؛ تمت أرشفته للحفاظ على الطلبات والمحادثات السابقة.");
    } else {
      const { data, error } = await db.from("products")
        .delete()
        .eq("id", product.id)
        .eq("store_id", currentStore.id)
        .select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("لم يتم حذف المنتج. تحقق من صلاحيات المتجر ثم حاول مجدداً.");
      products = products.filter((item) => item.id !== product.id);
      showToast("تم حذف المنتج بنجاح.");
    }
    updateProductCounts();
    renderProductList();
    renderProductCards();
  } catch (error) {
    showToast("تعذر حذف المنتج: " + (error.message || "حاول مجدداً."));
    console.error("Product delete/archive failed:", error);
  } finally {
    button.disabled = false;
  }
}

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
    const statusLabels = { active: "نشط", draft: "مسودة", archived: "مؤرشف" };
    detail.textContent = (statusLabels[product.status] || "غير معروف") + " · " + (product.categories?.name || "غير مصنف") + " · الكمية: " + product.stock_quantity;
    info.append(name,detail);
    const price = document.createElement("span");
    price.className = "list-price";
    price.textContent = new Intl.NumberFormat("ar-IQ").format(product.price) + " د.ع";
    const actions = document.createElement("div");
    actions.className = "product-row-actions";
    const edit = document.createElement("button");
    edit.type = "button"; edit.className = "edit-product-button"; edit.textContent = "تعديل";
    edit.addEventListener("click", () => openProductDialog(product));
    const remove = document.createElement("button");
    remove.type = "button"; remove.className = "delete-product-button"; remove.textContent = "حذف";
    remove.setAttribute("aria-label", "حذف المنتج " + product.name);
    remove.addEventListener("click", () => handleDeleteProduct(product, remove));
    actions.append(edit, remove);
    row.append(icon,info,price,actions);
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
    const keptImages = existingProductImages.filter((image) => !removedProductImageIds.has(image.id));
    const uploadedUrls = [];
    for (const file of selectedProductFiles) uploadedUrls.push(await uploadImage(file, "products"));
    const finalImageUrls = [...keptImages.map((image) => image.image_url), ...uploadedUrls];
    const imageUrl = finalImageUrls[0] || null;
    const selectedStatus = productStatus.value;
    if (!["active", "draft", "archived"].includes(selectedStatus)) throw new Error("اختر حالة صحيحة للمنتج.");
    const payload = { store_id: currentStore.id, category_id: category?.id || null, name, price, currency: "IQD", stock_quantity: stock, image_url: imageUrl, status: selectedStatus };
    let saved;
    if (editingProductId) {
      const result = await db.from("products").update(payload).eq("id", editingProductId).eq("store_id", currentStore.id)
        .select("id,name,price,stock_quantity,status,category_id,image_url").single();
      if (result.error) throw result.error;
      saved = result.data;
      const removedIds = [...removedProductImageIds].filter((id) => !String(id).startsWith("legacy-"));
      if (removedIds.length) {
        const { error: deleteError } = await db.from("product_images").delete().in("id", removedIds).eq("product_id", editingProductId);
        if (deleteError) throw deleteError;
      }
    } else {
      const result = await db.from("products").insert(payload).select("id,name,price,stock_quantity,status,category_id,image_url").single();
      if (result.error) throw result.error;
      saved = result.data;
    }
    const galleryRows = finalImageUrls.map((url, index) => ({ product_id: saved.id, image_url: url, sort_order: index }));
    if (galleryRows.length) {
      const { data: existingRows, error: galleryReadError } = await db.from("product_images").select("image_url").eq("product_id", saved.id);
      if (galleryReadError) throw galleryReadError;
      const existingUrls = new Set((existingRows || []).map((row) => row.image_url));
      const newRows = galleryRows.filter((row) => !existingUrls.has(row.image_url));
      if (newRows.length) {
        const { error: galleryInsertError } = await db.from("product_images").insert(newRows);
        if (galleryInsertError) throw galleryInsertError;
      }
      for (let index = 0; index < finalImageUrls.length; index++) {
        const { error: orderError } = await db.from("product_images").update({ sort_order: index }).eq("product_id", saved.id).eq("image_url", finalImageUrls[index]);
        if (orderError) throw orderError;
      }
    }
    const updatedProduct = { ...saved, categories: { name: productCategory.value } };
    if (editingProductId) products = products.map((item) => item.id === saved.id ? updatedProduct : item);
    else products.unshift(updatedProduct);
    updateProductCounts(); productForm.reset(); productImagesPreview.replaceChildren(); productImagesPreview.classList.add("hidden");
    existingProductImages = []; removedProductImageIds = new Set(); selectedProductFiles = [];
    editingProductId = null; dialog.close(); renderProductList(); renderProductCards(); showView("products");
    showToast("تم حفظ بيانات المنتج وصوره بنجاح.");
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
    return sum + Number(order.subtotal ?? order.order_items.reduce((lineSum, item) => lineSum + Number(item.line_total ?? (Number(item.unit_price) * Number(item.quantity))), 0));
  }, 0);
  const completedCommission = completedOrders.reduce((sum, order) => sum + Number(order.commission_amount || 0), 0);
  const completedDelivery = completedOrders.reduce((sum, order) => sum + Number(order.delivery_fee || 0), 0);
  const completedMerchantNet = completedOrders.reduce((sum, order) => {
    const gross = Number(order.total ?? (Number(order.subtotal || 0) + Number(order.delivery_fee || 0)));
    return sum + Math.max(0, gross - Number(order.commission_amount || 0));
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
  const analyticsCommission = document.querySelector("#analytics-commission-total");
  const analyticsNet = document.querySelector("#analytics-merchant-net");
  const analyticsDelivery = document.querySelector("#analytics-delivery-total");
  const analyticsEmpty = document.querySelector("#analytics-empty-note");
  if (analyticsSales) analyticsSales.textContent = orderMoney(completedSales);
  if (analyticsOrders) analyticsOrders.textContent = String(count);
  if (analyticsAverage) analyticsAverage.textContent = orderMoney(average);
  if (analyticsCommission) analyticsCommission.textContent = orderMoney(completedCommission);
  if (analyticsNet) analyticsNet.textContent = orderMoney(completedMerchantNet);
  if (analyticsDelivery) analyticsDelivery.textContent = orderMoney(completedDelivery);
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
    const card = document.createElement("article"); card.className = "merchant-order-card"; card.id = "merchant-order-" + order.id;
    const head = document.createElement("div"); head.className = "merchant-order-head";
    const heading = document.createElement("div");
    const number = document.createElement("strong"); number.textContent = "#BB-" + order.order_number;
    const date = document.createElement("small");
    date.textContent = new Date(order.created_at).toLocaleString("ar-IQ", { dateStyle: "medium", timeStyle: "short" });
    heading.append(number, date);
    const status = document.createElement("span"); status.className = "status " + orderStatusClass(order.status);
    status.textContent = orderStatusLabels[order.status] || order.status;
    head.append(heading, status); card.append(head);

    if (order.status_history.length) {
      const historyPanel = document.createElement("div"); historyPanel.className = "merchant-order-history";
      const historyTitle = document.createElement("strong"); historyTitle.textContent = "سجل التوصيل والحالة";
      const historyList = document.createElement("ol");
      order.status_history.forEach((event) => {
        const entry = document.createElement("li");
        const eventLabel = document.createElement("span"); eventLabel.textContent = event.note || orderStatusLabels[event.status] || event.status;
        const eventDate = document.createElement("time"); eventDate.dateTime = event.created_at;
        eventDate.textContent = new Date(event.created_at).toLocaleString("ar-IQ", { dateStyle: "medium", timeStyle: "short" });
        entry.append(eventLabel, eventDate); historyList.append(entry);
      });
      historyPanel.append(historyTitle, historyList); card.append(historyPanel);
    }

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
    const productsSubtotal = order.order_items.reduce((sum, item) => sum + Number(item.line_total ?? (Number(item.unit_price) * Number(item.quantity))), 0);
    const deliveryFee = Number(order.delivery_fee || 0);
    const orderTotal = order.total == null ? productsSubtotal + deliveryFee : Number(order.total);
    const footer = document.createElement("div"); footer.className = "merchant-order-footer";
    const totalLabel = document.createElement("div");
    const totalCaption = document.createElement("small"); totalCaption.textContent = "مجموع المنتجات";
    const totalValue = document.createElement("strong"); totalValue.textContent = orderMoney(productsSubtotal);
    const deliveryCaption = document.createElement("small"); deliveryCaption.textContent = "أجرة التوصيل";
    const deliveryValue = document.createElement("strong"); deliveryValue.textContent = orderMoney(deliveryFee);
    const payableCaption = document.createElement("small"); payableCaption.textContent = "إجمالي الطلب على المشتري";
    const payableValue = document.createElement("strong"); payableValue.textContent = orderMoney(orderTotal);
    const commissionRate = Number(order.commission_rate || 0);
    const commission = order.status === "cancelled" ? 0 : Number(order.commission_amount || 0);
    const commissionCaption = document.createElement("small");
    commissionCaption.textContent = order.status === "cancelled"
      ? "عمولة المنصة (ملغي)"
      : commissionRate <= 0
        ? "عمولة المنصة (لا تطبق على الطلب السابق)"
        : order.status === "delivered"
          ? "عمولة المنصة (" + commissionRate + "%)"
          : "العمولة المتوقعة عند التسليم (" + commissionRate + "%)";
    const commissionValue = document.createElement("strong"); commissionValue.textContent = orderMoney(commission);
    const netCaption = document.createElement("small");
    netCaption.textContent = order.status === "delivered" ? "صافي مستحق التاجر شامل التوصيل" : order.status === "cancelled" ? "صافي مستحق التاجر" : "الصافي المتوقع عند التسليم";
    const netValue = document.createElement("strong");
    netValue.textContent = orderMoney(order.status === "cancelled" ? 0 : Math.max(0, orderTotal - commission));
    totalLabel.append(totalCaption, totalValue, deliveryCaption, deliveryValue, payableCaption, payableValue, commissionCaption, commissionValue, netCaption, netValue);
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
    .select("id,order_number,status,subtotal,delivery_fee,total,commission_rate,commission_amount,customer_name,customer_phone,shipping_address,notes,created_at,order_items!inner(id,store_id,product_name,unit_price,quantity,line_total)")
    .eq("order_items.store_id", currentStore.id)
    .order("created_at", { ascending: false });
  if (error) {
    host.replaceChildren();
    const notice = document.createElement("div"); notice.className = "notice-box"; notice.textContent = "تعذر تحميل الطلبات: " + error.message; host.append(notice);
    showToast("تعذر تحميل الطلبات من قاعدة البيانات.");
    return;
  }
  merchantOrders = (data || []).map((order) => ({ ...order, order_items: order.order_items || [], status_history: [] }));
  if (merchantOrders.length) {
    const { data: historyRows, error: historyError } = await db.from("order_status_history")
      .select("id,order_id,status,note,created_at")
      .in("order_id", merchantOrders.map((order) => order.id))
      .order("created_at", { ascending: true });
    if (!historyError) {
      const historyMap = new Map();
      (historyRows || []).forEach((event) => {
        if (!historyMap.has(event.order_id)) historyMap.set(event.order_id, []);
        historyMap.get(event.order_id).push(event);
      });
      merchantOrders.forEach((order) => { order.status_history = historyMap.get(order.id) || []; });
    } else {
      console.warn("Merchant order history unavailable:", historyError);
    }
  }
  renderMerchantOrders();
}

async function updateMerchantOrderStatus(order, select) {
  const previous = order.status;
  const next = select.value;
  if (next === previous) return;
  if (next === "cancelled" && !globalThis.confirm("هل تريد إلغاء الطلب #" + order.order_number + "؟ ستُعاد الكميات الخاصة بمتجرك إلى المخزون.")) {
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


let activeMerchantConversationId = null;
let merchantChatBusy = false;
let merchantChatMessagesLoading = false;

function startMerchantChatAutoRefresh() {
  stopMerchantChatAutoRefresh();
  merchantChatRefreshTimer = globalThis.setInterval(async () => {
    if (document.querySelector("#chat-view").classList.contains("hidden")) return;
    try {
      await loadMerchantChats();
      if (activeMerchantConversationId) await loadMerchantChatMessages();
    } catch (error) {
      console.warn("Merchant chat auto-refresh failed:", error);
    }
  }, 5000);
  subscribeMerchantChatConversations();
  subscribeMerchantChatMessages();
}

function stopMerchantChatAutoRefresh() {
  if (merchantChatRefreshTimer !== null) globalThis.clearInterval(merchantChatRefreshTimer);
  merchantChatRefreshTimer = null;
  if (merchantChatRealtimeChannel && db) {
    db.removeChannel(merchantChatRealtimeChannel);
    merchantChatRealtimeChannel = null;
  }
  if (merchantMessagesRealtimeChannel && db) {
    db.removeChannel(merchantMessagesRealtimeChannel);
    merchantMessagesRealtimeChannel = null;
  }
}

function subscribeMerchantChatConversations() {
  if (!db || !currentStore?.id) return;
  if (merchantChatRealtimeChannel) db.removeChannel(merchantChatRealtimeChannel);
  merchantChatRealtimeChannel = db
    .channel("merchant-chat-list-" + currentStore.id)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "chat_conversations",
      filter: "store_id=eq." + currentStore.id
    }, () => {
      if (!document.querySelector("#chat-view").classList.contains("hidden")) {
        loadMerchantChats().catch((error) => console.warn("Merchant chat list realtime update failed:", error));
      }
    })
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("Merchant chat realtime unavailable; automatic polling remains enabled.");
      }
    });
}

function subscribeMerchantChatMessages() {
  if (merchantMessagesRealtimeChannel && db) {
    db.removeChannel(merchantMessagesRealtimeChannel);
    merchantMessagesRealtimeChannel = null;
  }
  if (!db || !activeMerchantConversationId) return;
  merchantMessagesRealtimeChannel = db
    .channel("merchant-chat-messages-" + activeMerchantConversationId)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "chat_messages",
      filter: "conversation_id=eq." + activeMerchantConversationId
    }, () => {
      if (!merchantChatMessagesLoading && !document.querySelector("#chat-view").classList.contains("hidden")) {
        loadMerchantChatMessages().catch((error) => console.warn("Merchant realtime message update failed:", error));
      }
    })
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("Merchant message realtime unavailable; automatic polling remains enabled.");
      }
    });
}

async function loadMerchantChats() {
  if (!currentStore) return;
  const host = document.querySelector("#merchant-chat-list");
  if (!host.children.length) {
    const loading = document.createElement("p");
    loading.className = "notice-box";
    loading.textContent = "جارٍ تحميل المحادثات...";
    host.append(loading);
  }
  try {
    const { data, error } = await db.from("chat_conversations")
      .select("id,customer_id,product_id,last_message_at")
      .eq("store_id", currentStore.id)
      .order("last_message_at", { ascending: false });
    if (error) throw error;
    const conversations = data || [];
    host.replaceChildren();
    if (!conversations.length) {
      const empty = document.createElement("p");
      empty.className = "notice-box";
      empty.textContent = "لا توجد رسائل بعد. ستظهر هنا محادثات الزبائن عند مراسلة متجرك.";
      host.append(empty);
      return;
    }
    const customerIds = [...new Set(conversations.map((item) => item.customer_id))];
    const productIds = [...new Set(conversations.map((item) => item.product_id).filter(Boolean))];
    const [profilesResult, productsResult] = await Promise.all([
      db.from("profiles").select("id,full_name").in("id", customerIds),
      productIds.length ? db.from("products").select("id,name").in("id", productIds) : Promise.resolve({data:[],error:null})
    ]);
    if (profilesResult.error) throw profilesResult.error;
    if (productsResult.error) throw productsResult.error;
    const names = new Map((profilesResult.data || []).map((row) => [row.id, row.full_name || "زبون"]));
    const productNames = new Map((productsResult.data || []).map((row) => [row.id, row.name || "منتج"]));
    conversations.forEach((conversation) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "merchant-chat-list-item" + (conversation.id === activeMerchantConversationId ? " active" : "");
      const title = document.createElement("strong");
      title.textContent = names.get(conversation.customer_id) || "زبون";
      const product = document.createElement("small");
      product.textContent = productNames.get(conversation.product_id) || "استفسار عن المتجر";
      const date = document.createElement("time");
      const parsed = new Date(conversation.last_message_at);
      date.textContent = Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString("ar-IQ", {dateStyle:"short",timeStyle:"short"});
      button.append(title, product, date);
      button.addEventListener("click", () => openMerchantConversation(conversation, names.get(conversation.customer_id) || "زبون", productNames.get(conversation.product_id) || "استفسار عن المتجر"));
      host.append(button);
    });
    if (activeMerchantConversationId && !conversations.some((item) => item.id === activeMerchantConversationId)) {
      activeMerchantConversationId = null;
      document.querySelector("#merchant-chat-context").textContent = "اختر محادثة من القائمة لقراءة الرسائل والرد عليها.";
      document.querySelector("#merchant-chat-messages").replaceChildren();
      setMerchantChatComposer(false);
    }
  } catch (error) {
    host.replaceChildren();
    const message = document.createElement("p");
    message.className = "notice-box";
    message.textContent = "تعذر تحميل المحادثات. " + (error.message || "حاول مجدداً.");
    host.append(message);
    console.error("Merchant chat load failed:", error);
  }
}

function setMerchantChatComposer(enabled) {
  document.querySelector("#merchant-chat-input").disabled = !enabled;
  document.querySelector("#merchant-chat-form button[type='submit']").disabled = !enabled;
}

async function openMerchantConversation(conversation, customerName, productName) {
  activeMerchantConversationId = conversation.id;
  subscribeMerchantChatMessages();
  document.querySelector("#merchant-chat-context").textContent = customerName + " · " + productName;
  setMerchantChatComposer(true);
  await loadMerchantChatMessages();
  document.querySelectorAll(".merchant-chat-list-item").forEach((button) => button.classList.remove("active"));
  const active = [...document.querySelectorAll(".merchant-chat-list-item")].find((button) => button.querySelector("strong")?.textContent === customerName && button.querySelector("small")?.textContent === productName);
  active?.classList.add("active");
}

async function loadMerchantChatMessages() {
  if (!activeMerchantConversationId || merchantChatMessagesLoading) return;
  merchantChatMessagesLoading = true;
  const host = document.querySelector("#merchant-chat-messages");
  const wasNearBottom = host.scrollHeight - host.scrollTop - host.clientHeight < 60;
  if (!host.children.length) {
    const loading = document.createElement("p");
    loading.className = "notice-box";
    loading.textContent = "جارٍ تحميل الرسائل...";
    host.append(loading);
  }
  try {
    const { data, error } = await db.from("chat_messages")
      .select("id,sender_id,body,created_at")
      .eq("conversation_id", activeMerchantConversationId)
      .order("created_at", {ascending:true});
    if (error) throw error;
    host.replaceChildren();
  if (!data?.length) {
    const empty = document.createElement("p");
    empty.className = "notice-box";
    empty.textContent = "ابدأ الرد على استفسار الزبون.";
    host.append(empty);
    return;
  }
  data.forEach((message) => {
    const bubble = document.createElement("article");
    bubble.className = "merchant-chat-bubble " + (message.sender_id === currentUser.id ? "mine" : "customer");
    const sender = document.createElement("small");
    sender.textContent = message.sender_id === currentUser.id ? "أنا" : "الزبون";
    const body = document.createElement("p"); body.textContent = message.body;
    const time = document.createElement("time");
    const parsed = new Date(message.created_at);
    time.textContent = Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString("ar-IQ", {dateStyle:"short",timeStyle:"short"});
    bubble.append(sender, body, time); host.append(bubble);
  });
    if (wasNearBottom) host.scrollTop = host.scrollHeight;
  } finally {
    merchantChatMessagesLoading = false;
  }
}

async function sendMerchantChatMessage(event) {
  event.preventDefault();
  const input = document.querySelector("#merchant-chat-input");
  const body = input.value.trim();
  if (!body || !activeMerchantConversationId || merchantChatBusy) return;
  merchantChatBusy = true;
  setMerchantChatComposer(false);
  try {
    const { error } = await db.from("chat_messages").insert({
      conversation_id: activeMerchantConversationId,
      sender_id: currentUser.id,
      body
    });
    if (error) throw error;
    input.value = "";
    await loadMerchantChatMessages();
    await loadMerchantChats();
  } catch (error) {
    showToast("تعذر إرسال الرد: " + (error.message || "حاول مجدداً."));
  } finally {
    merchantChatBusy = false;
    setMerchantChatComposer(Boolean(activeMerchantConversationId));
  }
}

document.querySelector("#refresh-merchant-chats")?.addEventListener("click", async () => {
  await loadMerchantChats();
  if (activeMerchantConversationId) {
    try { await loadMerchantChatMessages(); }
    catch (error) { showToast("تعذر تحديث الرسائل: " + (error.message || "حاول مجدداً.")); }
  }
});
document.querySelector("#merchant-chat-form")?.addEventListener("submit", sendMerchantChatMessage);

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
    globalThis.location.href = "index.html";
    return;
  }
  const { data: sessionData, error: sessionError } = await db.auth.getSession();
  currentUser = sessionData?.session?.user;
  if (sessionError || !currentUser) {
    globalThis.location.href = "index.html";
    return;
  }

  const { data: profile, error: profileError } = await db.from("profiles").select("id,full_name,role,phone").eq("id", currentUser.id).single();
  if (profileError || profile?.role !== "merchant") {
    await db.auth.signOut();
    globalThis.location.href = "index.html";
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
  await refreshMerchantNotificationBadge();
  if (!globalThis.__bbenMerchantNotificationPoll) globalThis.__bbenMerchantNotificationPoll = setInterval(refreshMerchantNotificationBadge, 30000);
  document.querySelector(".profile-name strong").textContent = profile.full_name || "التاجر";
  document.querySelector(".store-chip strong").textContent = store.name;
  const storeAvatar = document.querySelector(".store-avatar");
  storeAvatar.replaceChildren();
  if (store.logo_url) {
    const storeLogo = document.createElement("img");
    storeLogo.src = store.logo_url;
    storeLogo.alt = "شعار المتجر";
    storeAvatar.append(storeLogo);
  } else {
    storeAvatar.textContent = "ت";
  }
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
  // Deep-link from the public store's order button directly to merchant order management.
  const requestedParams = new URLSearchParams(globalThis.location.search);
  const requestedView = requestedParams.get("view") || (requestedParams.has("order_id") ? "orders" : null);
  if (requestedView === "orders" || requestedView === "chat") showView(requestedView);
  const requestedOrderId = requestedParams.get("order_id");
  if (requestedOrderId) { const orderCard = document.getElementById("merchant-order-" + requestedOrderId); if (orderCard) { orderCard.scrollIntoView({behavior:"smooth",block:"center"}); orderCard.classList.add("notification-order-focus"); setTimeout(() => orderCard.classList.remove("notification-order-focus"), 2400); } }
}

initSeller();

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") sidebar.classList.remove("open");
});
