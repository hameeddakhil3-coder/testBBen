const db = window.bbenSupabase;
const $ = (selector) => document.querySelector(selector);
let currentProfile = null;
const pageParams = new URLSearchParams(window.location.search);
const requestedStoreId = pageParams.get("store_id") || (window.location.pathname.endsWith("/store.html") || window.location.pathname === "store.html" ? pageParams.get("id") : null);
const isStorePage = Boolean(requestedStoreId);
const isFavoritesPage = /(?:^|\/)favorites\.html$/.test(window.location.pathname) || pageParams.get("view") === "favorites";
let publicStore = null;
const storeHref = (store) => store?.id ? "market.html?store_id=" + encodeURIComponent(store.id) : "market.html";
let allProducts = [];
let allCategories = [];
let activeCategory = "";
let activeCity = "";
let currentUser = null;
let currentRole = null;
let cartItems = [];
let toastTimer;
let showFavoritesOnly = isFavoritesPage;
let favoriteIds = new Set();
try {
  const savedFavorites = JSON.parse(window.localStorage.getItem("bben_favorite_products") || "[]");
  if (Array.isArray(savedFavorites)) favoriteIds = new Set(savedFavorites.map(String));
} catch (error) {
  console.warn("Could not read saved favorites:", error);
}

const money = (value) => new Intl.NumberFormat("ar-IQ").format(Number(value) || 0) + " د.ع";

let marketCampaigns = [];
let activeCampaignIndex = 0;
let campaignTimer = null;
let campaignTarget = "#products-section";
function safeCampaignTarget(value) {
  const target = String(value || "#products-section").trim();
  if (!target || /^(?:https?:)?\/\//i.test(target) || /^javascript:/i.test(target) || target.startsWith("..") || /[\r\n]/.test(target)) return "#products-section";
  if (target.startsWith("#")) return target;
  if (/^[a-z0-9_./?=&%-]+$/i.test(target) && !target.includes(":")) return target;
  return "#products-section";
}
function renderCampaign(index = activeCampaignIndex) {
  const section = $("#market-promo-strip");
  if (!section) return;
  const campaign = marketCampaigns[index] || null;
  activeCampaignIndex = campaign ? index : 0;
  $("#campaign-eyebrow").textContent = campaign ? "حملة مميزة من BBen" : "مرحباً بك في BBen";
  $("#campaign-title").textContent = campaign?.title || "اكتشف منتجات المتاجر";
  $("#campaign-subtitle").textContent = campaign?.subtitle || "تصفّح المنتجات المتاحة واختر ما يناسبك من متاجر BBen.";
  $("#browse-button").textContent = (campaign?.button_label || "تصفّح المنتجات") + " ←";
  campaignTarget = safeCampaignTarget(campaign?.target_url);
  const image = $("#campaign-image");
  const placeholder = section.querySelector(".campaign-art-placeholder");
  const imageUrl = String(campaign?.image_url || "").trim();
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    image.src = imageUrl;
    image.alt = "";
    image.hidden = false;
    if (placeholder) placeholder.hidden = true;
    image.onerror = () => {
      image.hidden = true;
      if (placeholder) placeholder.hidden = false;
    };
  } else {
    image.removeAttribute("src");
    image.hidden = true;
    if (placeholder) placeholder.hidden = false;
  }
  section.classList.toggle("no-campaign-image", !imageUrl);
  const pagination = $("#campaign-pagination");
  pagination.replaceChildren();
  marketCampaigns.forEach((item, dotIndex) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "campaign-dot" + (dotIndex === activeCampaignIndex ? " active" : "");
    dot.setAttribute("aria-label", "عرض الحملة " + (dotIndex + 1) + ": " + item.title);
    dot.setAttribute("aria-current", String(dotIndex === activeCampaignIndex));
    dot.addEventListener("click", () => { renderCampaign(dotIndex); restartCampaignTimer(); });
    pagination.append(dot);
  });
  const hasMultiple = marketCampaigns.length > 1;
  $("#campaign-prev").hidden = !hasMultiple;
  $("#campaign-next").hidden = !hasMultiple;
  pagination.hidden = !hasMultiple;
  if (!campaign) {
    $("#campaign-prev").hidden = true;
    $("#campaign-next").hidden = true;
    pagination.hidden = true;
  }
}
async function loadCampaigns() {
  try {
    const result = await db.from("marketing_campaigns")
      .select("id,title,subtitle,image_url,button_label,target_url,sort_order,starts_at,ends_at")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (result.error) throw result.error;
    const now = Date.now();
    marketCampaigns = (result.data || []).filter(c =>
      (!c.starts_at || new Date(c.starts_at).getTime() <= now) &&
      (!c.ends_at || new Date(c.ends_at).getTime() > now)
    );
  } catch (error) {
    console.warn("Campaigns could not be loaded:", error);
    marketCampaigns = [];
  }
  activeCampaignIndex = 0;
  renderCampaign(0);
  restartCampaignTimer();
}
function restartCampaignTimer() {
  if (campaignTimer !== null) window.clearInterval(campaignTimer);
  campaignTimer = null;
  if (marketCampaigns.length < 2) return;
  campaignTimer = window.setInterval(() => {
    const section = $("#market-promo-strip");
    if (!section || section.hidden || document.hidden || section.matches(":hover") || section.contains(document.activeElement)) return;
    renderCampaign((activeCampaignIndex + 1) % marketCampaigns.length);
  }, 6000);
}
function openCampaignTarget() {
  const target = safeCampaignTarget(campaignTarget);
  if (target.startsWith("#")) {
    const element = document.querySelector(target);
    if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  window.location.href = target;
}

const safeText = (value) => String(value ?? "");
function toast(text) {
  const el = $("#market-toast");
  el.textContent = text; el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
}
async function loadFavoriteIds() {
  if (currentUser && currentRole === "customer") {
    const result = await db.from("product_favorites").select("product_id").eq("customer_id", currentUser.id);
    if (result.error) throw result.error;
    favoriteIds = new Set((result.data || []).map((row) => String(row.product_id)));
    try { window.localStorage.setItem("bben_favorite_products", JSON.stringify([...favoriteIds])); } catch {}
  } else {
    try {
      const saved = JSON.parse(window.localStorage.getItem("bben_favorite_products") || "[]");
      favoriteIds = new Set(Array.isArray(saved) ? saved.map(String) : []);
    } catch { favoriteIds = new Set(); }
  }
}
async function toggleFavorite(product) {
  const id = String(product.id);
  const removing = favoriteIds.has(id);
  if (currentUser && currentRole === "customer") {
    const result = removing
      ? await db.from("product_favorites").delete().eq("customer_id", currentUser.id).eq("product_id", product.id)
      : await db.from("product_favorites").insert({ customer_id: currentUser.id, product_id: product.id });
    if (result.error) throw result.error;
  } else if (currentUser && currentRole !== "customer") {
    toast("المفضلة متاحة لحساب المشتري فقط.");
    return;
  }
  if (removing) favoriteIds.delete(id); else favoriteIds.add(id);
  try { window.localStorage.setItem("bben_favorite_products", JSON.stringify([...favoriteIds])); } catch {}
  renderProducts();
  toast(removing ? "أُزيل المنتج من المفضلة." : "أُضيف المنتج إلى المفضلة.");
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
function productImageUrls(product) {
  const gallery = Array.isArray(product?.product_images) ? [...product.product_images].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)).map((image) => image.image_url).filter(Boolean) : [];
  const urls = [...gallery];
  if (product?.image_url && !urls.includes(product.image_url)) urls.unshift(product.image_url);
  return [...new Set(urls)];
}
function primaryProductImage(product) { return productImageUrls(product)[0] || null; }
function makePlaceholder() {
  const box = document.createElement("div"); box.className = "image-placeholder";
  const emoji = document.createElement("b"); emoji.textContent = "📦";
  const label = document.createElement("span"); label.textContent = "لا توجد صورة";
  box.append(emoji, label); return box;
}
function renderCategories() {
  const host = $("#category-list"); host.replaceChildren();
  const availableCategoryIds = new Set(allProducts.map((product) => product.category_id).filter(Boolean));
  const categories = [{ id: "", name: "الكل" }, ...allCategories.filter((category) => availableCategoryIds.has(category.id))];
  categories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = "category-chip" + (activeCategory === category.id ? " active" : "");
    button.dataset.category = category.id; button.textContent = category.name;
    button.addEventListener("click", () => { activeCategory = category.id; renderCategories(); renderProducts(); });
    host.append(button);
  });
}
function renderCities() {
  const select = $("#city-filter");
  if (!select) return;
  const currentValue = activeCity;
  const cities = [...new Set(allProducts.map((product) => String(product.stores?.city || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ar"));
  select.replaceChildren();
  const allOption = document.createElement("option");
  allOption.value = ""; allOption.textContent = "كل المدن"; select.append(allOption);
  cities.forEach((city) => {
    const option = document.createElement("option"); option.value = city; option.textContent = city; select.append(option);
  });
  activeCity = cities.includes(currentValue) ? currentValue : "";
  select.value = activeCity;
}
function renderStores() {
  const grid = $("#store-grid");
  const emptyMessage = $("#stores-empty-message");
  if (!grid || !emptyMessage) return;
  grid.replaceChildren();

  const stores = new Map();
  allProducts.forEach((product) => {
    const store = product.stores;
    if (!store?.id) return;
    if (!stores.has(store.id)) stores.set(store.id, { ...store, productCount: 0 });
    stores.get(store.id).productCount += 1;
  });

  const availableStores = [...stores.values()].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "ar")
  );
  emptyMessage.classList.toggle("hidden", availableStores.length > 0);

  availableStores.forEach((store) => {
    const link = document.createElement("a");
    link.className = "market-store-card";
    link.href = storeHref(store);
    link.setAttribute("aria-label", "تصفح منتجات متجر " + (store.name || "BBen"));

    const logo = document.createElement("div");
    logo.className = "market-store-logo";
    if (store.logo_url) {
      const image = document.createElement("img");
      image.src = store.logo_url;
      image.alt = "شعار " + (store.name || "المتجر");
      image.loading = "lazy";
      image.addEventListener("error", () => {
        logo.replaceChildren();
        logo.textContent = "🏪";
      }, { once: true });
      logo.append(image);
    } else {
      logo.textContent = "🏪";
    }

    const copy = document.createElement("div");
    copy.className = "market-store-copy";
    const name = document.createElement("strong");
    name.textContent = store.name || "متجر BBen";
    const details = document.createElement("small");
    details.textContent = [store.city, store.productCount + " منتج متاح"].filter(Boolean).join(" · ");
    copy.append(name, details, storeRatingSummary(store));

    const visit = document.createElement("span");
    visit.className = "market-store-visit";
    visit.textContent = "زيارة المتجر ←";
    link.append(logo, copy, visit);
    grid.append(link);
  });
}

function visibleProducts() {
  const query = $("#search-input").value.trim().toLocaleLowerCase("ar");
  let items = allProducts.filter((p) => {
    const categoryMatch = !activeCategory || p.category_id === activeCategory;
    const cityMatch = !activeCity || String(p.stores?.city || "").trim() === activeCity;
    const favoriteMatch = !showFavoritesOnly || favoriteIds.has(String(p.id));
    const haystack = [p.name, p.description, p.categories?.name, p.stores?.name, p.stores?.city].filter(Boolean).join(" ").toLocaleLowerCase("ar");
    return categoryMatch && cityMatch && favoriteMatch && (!query || haystack.includes(query));
  });
  const sort = $("#sort-select").value;
  if (sort === "price-asc") items.sort((a,b) => Number(a.price)-Number(b.price));
  else if (sort === "price-desc") items.sort((a,b) => Number(b.price)-Number(a.price));
  else if (sort === "name") items.sort((a,b) => a.name.localeCompare(b.name, "ar"));
  else items.sort((a,b) => new Date(b.created_at)-new Date(a.created_at));
  return items;
}


async function loadStoreReviews(store, host) {
  if (!store?.id) return;
  const section=document.createElement("section"); section.className="store-reviews-section";
  section.innerHTML='<div class="reviews-heading"><h3>تقييمات المتجر</h3><span class="reviews-loading">جارٍ تحميل التقييمات...</span></div>';
  host.append(section); const heading=section.querySelector(".reviews-heading");
  try {
    const result=await db.from("store_reviews").select("id,store_id,order_id,customer_id,rating,review_text,created_at,updated_at").eq("store_id",store.id).order("created_at",{ascending:false});
    if(result.error)throw result.error;
    const list=result.data||[]; heading.querySelector(".reviews-loading")?.remove();
    const avg=list.length?list.reduce((sum,r)=>sum+Number(r.rating),0)/list.length:0;
    store.store_review_count=list.length;store.store_review_average=avg;
    const overview=document.createElement("div");overview.className="reviews-overview";
    const score=document.createElement("strong");score.textContent=list.length?avg.toFixed(1):"—";
    const stars=document.createElement("span");stars.className="rating-stars";stars.textContent=list.length?"★".repeat(Math.round(avg))+"☆".repeat(5-Math.round(avg)):"☆☆☆☆☆";
    const count=document.createElement("small");count.textContent=list.length+" تقييم";overview.append(score,stars,count);heading.append(overview);
    const listHost=document.createElement("div");listHost.className="product-review-list";
    if(!list.length){const empty=document.createElement("p");empty.className="reviews-empty";empty.textContent="لا توجد تقييمات لهذا المتجر بعد.";listHost.append(empty);}
    list.forEach(review=>{
      const item=document.createElement("article");item.className="product-review";
      const top=document.createElement("div");top.className="product-review-top";
      const who=document.createElement("strong");who.textContent=currentUser&&review.customer_id===currentUser.id?"تقييمك":"مشتري";
      const stars=document.createElement("span");stars.className="rating-stars";stars.textContent="★".repeat(Number(review.rating))+"☆".repeat(5-Number(review.rating));
      const date=document.createElement("time");date.textContent=new Date(review.created_at).toLocaleDateString("ar-IQ");top.append(who,stars,date);item.append(top);
      if(review.review_text){const body=document.createElement("p");body.textContent=review.review_text;item.append(body);}
      if(currentUser&&review.customer_id===currentUser.id){
        const del=document.createElement("button");del.type="button";del.className="delete-product-review";del.textContent="حذف تقييمي";
        del.addEventListener("click",async()=>{if(!window.confirm("هل تريد حذف تقييم المتجر؟"))return;del.disabled=true;try{const d=await db.from("store_reviews").delete().eq("id",review.id).eq("customer_id",currentUser.id);if(d.error)throw d.error;toast("تم حذف تقييم المتجر.");section.remove();loadStoreReviews(store,host);}catch(e){toast("تعذر حذف التقييم: "+(e.message||"حاول مجدداً."));del.disabled=false;}});
        item.append(del);
      }
      listHost.append(item);
    });
    section.append(listHost);
    if(currentUser&&currentRole==="customer"){
      const eligibility=await db.from("orders").select("id,order_items!inner(store_id)").eq("customer_id",currentUser.id).eq("status","delivered").eq("order_items.store_id",store.id);
      if(eligibility.error)throw eligibility.error;
      const eligible=eligibility.data||[];
      const previous=list.find(r=>r.customer_id===currentUser.id);
      const target=eligible.find(o=>previous&&o.id===previous.order_id)||eligible[0];
      if(target){
        const form=document.createElement("form");form.className="product-review-form";
        const title=document.createElement("h4");title.textContent=previous?"تعديل تقييم المتجر":"قيّم هذا المتجر";
        const label=document.createElement("label");label.textContent="تقييمك من 1 إلى 5 نجوم";
        const select=document.createElement("select");select.required=true;
        for(let n=5;n>=1;n--){const opt=document.createElement("option");opt.value=String(n);opt.textContent="★".repeat(n)+"☆".repeat(5-n)+" — "+n;if(Number(previous?.rating||5)===n)opt.selected=true;select.append(opt);}
        const textLabel=document.createElement("label");textLabel.textContent="مراجعة مكتوبة (اختياري)";
        const textarea=document.createElement("textarea");textarea.maxLength=1200;textarea.rows=3;textarea.placeholder="شارك تجربتك مع المتجر...";textarea.value=previous?.review_text||"";
        const submit=document.createElement("button");submit.type="submit";submit.className="primary-market-button";submit.textContent=previous?"حفظ التعديل":"إرسال تقييم المتجر";
        form.append(title,label,select,textLabel,textarea,submit);
        form.addEventListener("submit",async event=>{event.preventDefault();submit.disabled=true;try{
          const payload={store_id:store.id,order_id:target.id,customer_id:currentUser.id,rating:Number(select.value),review_text:textarea.value.trim()||null};
          const saved=previous?await db.from("store_reviews").update({rating:payload.rating,review_text:payload.review_text}).eq("id",previous.id).eq("customer_id",currentUser.id):await db.from("store_reviews").insert(payload);
          if(saved.error)throw saved.error;toast(previous?"تم تحديث تقييم المتجر.":"تم إرسال تقييم المتجر، شكراً لك.");section.remove();loadStoreReviews(store,host);
        }catch(e){toast("تعذر حفظ تقييم المتجر: "+(e.message||"حاول مجدداً."));submit.disabled=false;}});
        section.append(form);
      }else{const note=document.createElement("p");note.className="review-eligibility-note";note.textContent="يمكنك تقييم المتجر بعد تسليم طلب منه.";section.append(note);}
    }
  }catch(error){console.error("Store reviews load failed:",error);heading.querySelector(".reviews-loading")?.remove();const p=document.createElement("p");p.className="reviews-empty";p.textContent="تعذر تحميل تقييمات المتجر حالياً.";section.append(p);}
}
function storeRatingSummary(store){
 const row=document.createElement("div");row.className="product-rating-summary store-rating-summary";
 const stars=document.createElement("span");stars.className="rating-stars";const count=Number(store.store_review_count||0),avg=Number(store.store_review_average||0);
 stars.textContent=count?"★".repeat(Math.round(avg))+"☆".repeat(5-Math.round(avg)):"☆☆☆☆☆";
 const label=document.createElement("small");label.textContent=count?avg.toFixed(1)+" · "+count+" تقييم":"لا توجد تقييمات";row.append(stars,label);return row;
}

function ratingSummary(product) {
  const count = Number(product.review_count || 0), average = Number(product.review_average || 0);
  const row = document.createElement("div"); row.className = "product-rating-summary";
  const stars = document.createElement("span"); stars.className = "rating-stars";
  stars.textContent = count ? "★".repeat(Math.round(average)) + "☆".repeat(5-Math.round(average)) : "☆☆☆☆☆";
  const label = document.createElement("small"); label.textContent = count ? average.toFixed(1) + " · " + count + " تقييم" : "لا توجد تقييمات";
  row.append(stars,label); return row;
}
async function loadProductReviews(product, host) {
  const section=document.createElement("section"); section.className="product-reviews-section";
  section.innerHTML='<div class="reviews-heading"><h3>تقييمات المشترين</h3><span class="reviews-loading">جارٍ تحميل التقييمات...</span></div>';
  host.append(section); const heading=section.querySelector(".reviews-heading");
  try {
    const result=await db.from("product_reviews").select("id,product_id,order_id,order_item_id,customer_id,rating,review_text,created_at,updated_at").eq("product_id",product.id).order("created_at",{ascending:false});
    if(result.error) throw result.error;
    const list=result.data||[]; heading.querySelector(".reviews-loading")?.remove();
    const avg=list.length?list.reduce((sum,r)=>sum+Number(r.rating),0)/list.length:0;
    const overview=document.createElement("div"); overview.className="reviews-overview";
    const score=document.createElement("strong"); score.textContent=list.length?avg.toFixed(1):"—";
    const stars=document.createElement("span"); stars.className="rating-stars"; stars.textContent=list.length?"★".repeat(Math.round(avg))+"☆".repeat(5-Math.round(avg)):"☆☆☆☆☆";
    const count=document.createElement("small"); count.textContent=list.length+" تقييم"; overview.append(score,stars,count); heading.append(overview);
    const reviewList=document.createElement("div"); reviewList.className="product-review-list";
    if(!list.length){const empty=document.createElement("p");empty.className="reviews-empty";empty.textContent="لا توجد مراجعات لهذا المنتج بعد.";reviewList.append(empty);}
    list.forEach(review=>{
      const item=document.createElement("article");item.className="product-review";
      const top=document.createElement("div");top.className="product-review-top";
      const who=document.createElement("strong");who.textContent=currentUser&&review.customer_id===currentUser.id?"تقييمك":"مشتري";
      const rating=document.createElement("span");rating.className="rating-stars";rating.textContent="★".repeat(Number(review.rating))+"☆".repeat(5-Number(review.rating));
      const date=document.createElement("time");date.textContent=new Date(review.created_at).toLocaleDateString("ar-IQ");date.dateTime=review.created_at;
      top.append(who,rating,date);item.append(top);
      if(review.review_text){const body=document.createElement("p");body.textContent=review.review_text;item.append(body);}
      if(currentUser&&review.customer_id===currentUser.id){
        const remove=document.createElement("button");remove.type="button";remove.className="delete-product-review";remove.textContent="حذف تقييمي";
        remove.addEventListener("click",async()=>{
          if(!window.confirm("هل تريد حذف تقييمك لهذا المنتج؟"))return;
          remove.disabled=true;
          try{
            const deleted=await db.from("product_reviews").delete().eq("id",review.id).eq("customer_id",currentUser.id);
            if(deleted.error)throw deleted.error;
            toast("تم حذف تقييمك.");
            const refreshed=await db.from("product_reviews").select("rating").eq("product_id",product.id);
            if(refreshed.error)throw refreshed.error;
            const rows=refreshed.data||[];product.review_count=rows.length;product.review_average=rows.length?rows.reduce((sum,row)=>sum+Number(row.rating),0)/rows.length:0;
            renderProducts();showProductDetails(product);
          }catch(error){toast("تعذر حذف التقييم: "+(error.message||"حاول مجدداً."));remove.disabled=false;}
        });
        item.append(remove);
      }
      reviewList.append(item);
    });
    section.append(reviewList);
    if(currentUser&&currentRole==="customer"){
      const eligibility=await db.from("order_items").select("id,order_id,orders!inner(id,status,customer_id)").eq("product_id",product.id).eq("orders.customer_id",currentUser.id).eq("orders.status","delivered");
      if(eligibility.error)throw eligibility.error;
      const eligible=eligibility.data||[];
      const own=new Map(list.filter(r=>r.customer_id===currentUser.id).map(r=>[r.order_item_id,r]));
      const target=eligible.find(i=>!own.has(i.id))||eligible.find(i=>own.has(i.id));
      if(target){
        const previous=own.get(target.id)||null, form=document.createElement("form");form.className="product-review-form";
        const title=document.createElement("h4");title.textContent=previous?"تعديل تقييمك":"قيّم المنتج";
        const label=document.createElement("label");label.textContent="تقييمك من 1 إلى 5 نجوم";
        const select=document.createElement("select");select.required=true;select.setAttribute("aria-label","عدد النجوم");
        for(let n=5;n>=1;n--){const option=document.createElement("option");option.value=String(n);option.textContent="★".repeat(n)+"☆".repeat(5-n)+" — "+n;if(Number(previous?.rating||5)===n)option.selected=true;select.append(option);}
        const textLabel=document.createElement("label");textLabel.textContent="مراجعة مكتوبة (اختياري)";
        const textarea=document.createElement("textarea");textarea.maxLength=1200;textarea.rows=3;textarea.placeholder="شارك تجربتك مع المنتج...";textarea.value=previous?.review_text||"";
        const submit=document.createElement("button");submit.type="submit";submit.className="primary-market-button";submit.textContent=previous?"حفظ التعديل":"إرسال التقييم";
        form.append(title,label,select,textLabel,textarea,submit);
        form.addEventListener("submit",async event=>{
          event.preventDefault();submit.disabled=true;submit.textContent="جارٍ الحفظ...";
          try{
            const payload={product_id:product.id,order_id:target.order_id,order_item_id:target.id,customer_id:currentUser.id,rating:Number(select.value),review_text:textarea.value.trim()||null};
            const saved=previous?await db.from("product_reviews").update({rating:payload.rating,review_text:payload.review_text}).eq("id",previous.id).eq("customer_id",currentUser.id):await db.from("product_reviews").insert(payload);
            if(saved.error)throw saved.error;
            toast(previous?"تم تحديث تقييمك.":"تم إرسال تقييمك، شكراً لك.");
            const refreshed=await db.from("product_reviews").select("rating").eq("product_id",product.id);
            if(refreshed.error)throw refreshed.error;
            const rows=refreshed.data||[];product.review_count=rows.length;product.review_average=rows.length?rows.reduce((sum,r)=>sum+Number(r.rating),0)/rows.length:0;
            renderProducts();showProductDetails(product);
          }catch(error){toast("تعذر حفظ التقييم: "+(error.message||"حاول مجدداً."));submit.disabled=false;submit.textContent=previous?"حفظ التعديل":"إرسال التقييم";}
        });
        section.append(form);
      }else{const note=document.createElement("p");note.className="review-eligibility-note";note.textContent="يمكنك تقييم هذا المنتج بعد تسليم طلبك.";section.append(note);}
    }
  }catch(error){console.error("Product reviews load failed:",error);heading.querySelector(".reviews-loading")?.remove();const problem=document.createElement("p");problem.className="reviews-empty";problem.textContent="تعذر تحميل التقييمات حالياً.";section.append(problem);}
}

function renderProducts() {
  const grid = $("#product-grid"); grid.replaceChildren();
  const items = visibleProducts();
  $("#results-summary").textContent = items.length + " منتج";
  const favoriteFilter = $("#favorite-filter-button");
  if (favoriteFilter) {
    favoriteFilter.classList.toggle("active", showFavoritesOnly);
    favoriteFilter.setAttribute("aria-pressed", String(showFavoritesOnly));
    favoriteFilter.textContent = showFavoritesOnly ? "♥ عرض الكل" : "♡ المفضلة";
  }
  $("#clear-search").hidden = !$("#search-input").value;
  const message = $("#market-message");
  if (!items.length) {
    message.textContent = showFavoritesOnly && favoriteIds.size === 0
      ? "لم تحفظ أي منتج في المفضلة بعد. اضغط ♡ على المنتج لحفظه هنا."
      : (showFavoritesOnly && !items.length
        ? "لا توجد منتجات محفوظة تطابق هذه التصفية."
        : (allProducts.length ? "لم نعثر على منتجات تطابق بحثك. جرّب كلمة أخرى أو غيّر التصنيف." : (isStorePage ? "لا توجد منتجات نشطة في هذا المتجر حالياً." : "لا توجد منتجات منشورة للبيع حالياً. عندما يضيف التجار منتجات نشطة ستظهر هنا.")));
    message.classList.remove("hidden"); message.classList.toggle("error", !allProducts.length && message.dataset.error === "true");
    return;
  }
  message.textContent = ""; message.classList.add("hidden"); message.classList.remove("error");
  items.forEach((product) => {
    const card = document.createElement("article"); card.className = "market-card";
    const image = document.createElement("div");
    image.className = "market-card-image";
    image.setAttribute("role", "button");
    image.tabIndex = 0;
    image.setAttribute("aria-label", "عرض تفاصيل " + product.name);
    image.append(imageOrPlaceholder(primaryProductImage(product), product.name));
    const storeBadge = document.createElement("span"); storeBadge.className = "store-badge";
    if (product.stores?.logo_url) {
      const logo = document.createElement("img"); logo.src = product.stores.logo_url; logo.alt = ""; storeBadge.append(logo);
    }
    const storeName = document.createElement("span"); storeName.textContent = product.stores?.name || "متجر BBen"; storeBadge.append(storeName); image.append(storeBadge);
    image.addEventListener("click", () => showProductDetails(product));
    image.addEventListener("keydown", (event) => {
      if (event.target === image && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        showProductDetails(product);
      }
    });
    const body = document.createElement("div"); body.className = "market-card-body";
    const category = document.createElement("span"); category.className = "market-card-category"; category.textContent = product.categories?.name || "أخرى";
    const title = document.createElement("strong"); title.className = "market-card-title"; title.textContent = product.name;
    const store = document.createElement("a"); store.className = "market-card-store store-link"; store.href = storeHref(product.stores); store.textContent = product.stores?.city ? product.stores.name + " · " + product.stores.city : product.stores?.name || "متجر BBen"; store.setAttribute("aria-label", "زيارة متجر " + (product.stores?.name || "BBen"));
    const bottom = document.createElement("div"); bottom.className = "market-card-bottom";
    const price = document.createElement("span"); price.className = "market-price"; price.textContent = money(product.price);
    const actions = document.createElement("div"); actions.className = "market-card-actions";
    const detailButton = document.createElement("button"); detailButton.type = "button"; detailButton.className = "card-icon-button"; detailButton.textContent = "↗"; detailButton.setAttribute("aria-label", "تفاصيل المنتج"); detailButton.addEventListener("click", () => showProductDetails(product));
    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "card-favorite-button" + (favoriteIds.has(String(product.id)) ? " is-favorite" : "");
    favoriteButton.textContent = favoriteIds.has(String(product.id)) ? "♥" : "♡";
    favoriteButton.setAttribute("aria-label", favoriteIds.has(String(product.id)) ? "إزالة من المفضلة" : "حفظ في المفضلة");
    favoriteButton.setAttribute("aria-pressed", String(favoriteIds.has(String(product.id))));
    favoriteButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      favoriteButton.disabled = true;
      try { await toggleFavorite(product); }
      catch (error) { toast("تعذر تحديث المفضلة: " + (error.message || "حاول مجدداً.")); }
      finally { favoriteButton.disabled = false; }
    });
    image.append(favoriteButton);
    const addButton = document.createElement("button"); addButton.type = "button"; addButton.className = "card-add-button"; addButton.textContent = "+"; addButton.setAttribute("aria-label", "أضف إلى السلة");
    addButton.disabled = Number(product.stock_quantity) <= 0; addButton.title = addButton.disabled ? "نفدت الكمية" : "أضف إلى السلة";
    addButton.addEventListener("click", () => addToCart(product));
    actions.append(detailButton, addButton); bottom.append(price, actions);
    const stock = document.createElement("div"); stock.className = "stock-label" + (Number(product.stock_quantity) <= 0 ? " out" : "");
    stock.textContent = Number(product.stock_quantity) > 0 ? "متوفر · " + product.stock_quantity + " قطعة" : "نفدت الكمية";
    body.append(category, title, store, storeRatingSummary(product.stores), ratingSummary(product), bottom, stock); card.append(image, body); grid.append(card);
  });
}
let activeChatConversationId = null;
let activeChatProduct = null;
let chatSending = false;
let chatMessagesLoading = false;
let chatRefreshTimer = null;
let buyerChatRealtimeChannel = null;

function subscribeBuyerChatMessages() {
  if (buyerChatRealtimeChannel) {
    db.removeChannel(buyerChatRealtimeChannel);
    buyerChatRealtimeChannel = null;
  }
  if (!activeChatConversationId || !db) return;
  buyerChatRealtimeChannel = db
    .channel("buyer-chat-" + activeChatConversationId)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "chat_messages",
      filter: "conversation_id=eq." + activeChatConversationId
    }, () => {
      if (!chatMessagesLoading && $("#chat-dialog").open) {
        loadChatMessages().catch((error) => console.warn("Buyer realtime chat update failed:", error));
      }
    })
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("Buyer chat realtime unavailable; automatic polling remains enabled.");
      }
    });
}

function startChatAutoRefresh() {
  stopChatAutoRefresh();
  chatRefreshTimer = window.setInterval(async () => {
    if (!activeChatConversationId || !$("#chat-dialog").open || chatMessagesLoading) return;
    try { await loadChatMessages(); }
    catch (error) { console.warn("Chat auto-refresh failed:", error); }
  }, 4000);
}

function stopChatAutoRefresh() {
  if (chatRefreshTimer !== null) window.clearInterval(chatRefreshTimer);
  chatRefreshTimer = null;
  if (buyerChatRealtimeChannel && db) {
    db.removeChannel(buyerChatRealtimeChannel);
    buyerChatRealtimeChannel = null;
  }
}

async function openChatForProduct(product) {
  if (!currentUser || currentRole !== "customer") {
    toast("سجّل الدخول بحساب مشتري لمراسلة التاجر.");
    window.location.href = "index.html";
    return;
  }
  const storeId = product?.store_id || product?.stores?.id;
  if (!storeId) { toast("تعذر تحديد المتجر المرتبط بهذا المنتج."); return; }
  stopChatAutoRefresh();
  activeChatProduct = product;
  activeChatConversationId = null;
  const storeName = product?.stores?.name || "متجر BBen";
  $("#chat-context").textContent = "المتجر: " + storeName + " · المنتج: " + (product?.name || "استفسار عام");
  $("#chat-message-input").value = "";
  $("#chat-message-input").disabled = true;
  $("#chat-form button[type='submit']").disabled = true;
  $("#chat-messages").replaceChildren();
  const loading = document.createElement("p");
  loading.className = "chat-state";
  loading.textContent = "جارٍ فتح المحادثة...";
  $("#chat-messages").append(loading);
  $("#chat-dialog").showModal();
  try {
    let result = await db.from("chat_conversations")
      .select("id")
      .eq("customer_id", currentUser.id)
      .eq("store_id", storeId)
      .eq("product_id", product.id)
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) {
      result = await db.from("chat_conversations")
        .insert({ customer_id: currentUser.id, store_id: storeId, product_id: product.id })
        .select("id").single();
      if (result.error) {
        // Another open tab may have created the same conversation; re-read before reporting failure.
        const retry = await db.from("chat_conversations").select("id")
          .eq("customer_id", currentUser.id).eq("store_id", storeId).eq("product_id", product.id).maybeSingle();
        if (retry.error || !retry.data) throw result.error;
        result = retry;
      }
    }
    activeChatConversationId = result.data.id;
    await loadChatMessages();
    startChatAutoRefresh();
    subscribeBuyerChatMessages();
    $("#chat-message-input").disabled = false;
    $("#chat-form button[type='submit']").disabled = false;
    $("#chat-message-input").focus();
  } catch (error) {
    console.error("Chat open failed:", error);
    $("#chat-messages").replaceChildren();
    const message = document.createElement("p");
    message.className = "chat-state chat-state-error";
    message.textContent = "تعذر فتح المحادثة. تأكد من تسجيل الدخول وأن المتجر متاح، ثم حاول مجدداً.";
    $("#chat-messages").append(message);
    toast("تعذر فتح المحادثة: " + (error.message || "خطأ غير معروف"));
  }
}

async function loadChatMessages() {
  if (!activeChatConversationId || !currentUser || chatMessagesLoading) return;
  chatMessagesLoading = true;
  const host = $("#chat-messages");
  const wasNearBottom = host.scrollHeight - host.scrollTop - host.clientHeight < 60;
  try {
    const { data, error } = await db.from("chat_messages")
      .select("id,sender_id,body,created_at")
      .eq("conversation_id", activeChatConversationId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    host.replaceChildren();
  if (!data?.length) {
    const empty = document.createElement("div");
    empty.className = "chat-placeholder";
    const icon = document.createElement("span"); icon.setAttribute("aria-hidden", "true"); icon.textContent = "💬";
    const title = document.createElement("strong"); title.textContent = "ابدأ محادثتك مع التاجر";
    const note = document.createElement("p"); note.textContent = "اسأل عن توفر المنتج أو المقاسات أو أجرة التوصيل.";
    empty.append(icon, title, note); host.append(empty); return;
    }
    data.forEach((message) => {
    const bubble = document.createElement("article");
    const own = message.sender_id === currentUser.id;
    bubble.className = "chat-message-bubble " + (own ? "is-mine" : "is-theirs");
    const sender = document.createElement("small");
    sender.textContent = own ? "أنت" : "التاجر";
    const body = document.createElement("p"); body.textContent = message.body;
    const time = document.createElement("time");
    const date = new Date(message.created_at);
    time.dateTime = message.created_at;
    time.textContent = Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ar-IQ", { dateStyle: "short", timeStyle: "short" });
    bubble.append(sender, body, time); host.append(bubble);
    });
    if (wasNearBottom) host.scrollTop = host.scrollHeight;
  } finally {
    chatMessagesLoading = false;
  }
}

async function sendChatMessage(event) {
  event.preventDefault();
  const body = $("#chat-message-input").value.trim();
  if (!body || !activeChatConversationId || chatSending) return;
  if (body.length > 1000) { toast("الرسالة أطول من الحد المسموح (1000 حرف)."); return; }
  chatSending = true;
  const submit = $("#chat-form button[type='submit']");
  submit.disabled = true;
  try {
    const { error } = await db.from("chat_messages").insert({
      conversation_id: activeChatConversationId,
      sender_id: currentUser.id,
      body
    });
    if (error) throw error;
    $("#chat-message-input").value = "";
    await loadChatMessages();
  } catch (error) {
    console.error("Chat send failed:", error);
    toast("لم تُرسل الرسالة. " + (error.message || "حاول مجدداً."));
  } finally {
    chatSending = false;
    submit.disabled = !activeChatConversationId;
  }
}
function showProductDetails(product) {
  const host = $("#dialog-product-content"); host.replaceChildren();
  const layout = document.createElement("div"); layout.className = "dialog-product-layout";
  const image = document.createElement("div"); image.className = "dialog-product-image";
  const imageUrls = productImageUrls(product);
  const galleryMain = document.createElement("div"); galleryMain.className = "dialog-gallery-main";
  galleryMain.append(imageOrPlaceholder(imageUrls[0], product.name)); image.append(galleryMain);
  if (imageUrls.length > 1) {
    const thumbnails = document.createElement("div"); thumbnails.className = "dialog-gallery-thumbnails";
    imageUrls.forEach((url, index) => {
      const thumb = document.createElement("button"); thumb.type = "button"; thumb.className = "dialog-gallery-thumb" + (index === 0 ? " active" : "");
      thumb.setAttribute("aria-label", "عرض الصورة " + (index + 1));
      const thumbImage = document.createElement("img"); thumbImage.src = url; thumbImage.alt = product.name + " - صورة " + (index + 1); thumbImage.loading = "lazy"; thumb.append(thumbImage);
      thumb.addEventListener("click", () => {
        galleryMain.replaceChildren(imageOrPlaceholder(url, product.name));
        thumbnails.querySelectorAll(".dialog-gallery-thumb").forEach((button) => button.classList.remove("active"));
        thumb.classList.add("active");
      });
      thumbnails.append(thumb);
    });
    image.append(thumbnails);
  }
  const info = document.createElement("div"); info.className = "dialog-product-info";
  const category = document.createElement("span"); category.className = "market-card-category"; category.textContent = product.categories?.name || "أخرى";
  const title = document.createElement("h2"); title.textContent = product.name;
  const price = document.createElement("div"); price.className = "dialog-product-price"; price.textContent = money(product.price);
  const description = document.createElement("p"); description.textContent = product.description || "لا يوجد وصف إضافي لهذا المنتج حالياً.";
  const store = document.createElement("a"); store.className = "dialog-store store-link"; store.href = storeHref(product.stores);
  if (product.stores?.logo_url) { const logo = document.createElement("img"); logo.src = product.stores.logo_url; logo.alt = ""; store.append(logo); }
  const storeName = document.createElement("span"); storeName.textContent = "زيارة المتجر: " + (product.stores?.name || "متجر BBen") + (product.stores?.city ? " · " + product.stores.city : ""); store.append(storeName);
  const stock = document.createElement("p"); stock.textContent = Number(product.stock_quantity) > 0 ? "الكمية المتاحة: " + product.stock_quantity : "نفدت الكمية حالياً.";
  const add = document.createElement("button"); add.type = "button"; add.className = "primary-market-button dialog-add"; add.textContent = Number(product.stock_quantity) > 0 ? "إضافة إلى السلة" : "غير متوفر"; add.disabled = Number(product.stock_quantity) <= 0; add.addEventListener("click", () => addToCart(product));
  const chatButton = document.createElement("button");
  chatButton.type = "button";
  chatButton.className = "secondary-market-button dialog-chat-button";
  chatButton.textContent = "💬 مراسلة التاجر";
  chatButton.addEventListener("click", () => {
    $("#product-dialog").close();
    openChatForProduct(product);
  });
  info.append(category, title, price, storeRatingSummary(product.stores), ratingSummary(product), description, store, stock, add, chatButton); layout.append(image, info); host.append(layout);
  loadProductReviews(product, host);
  loadStoreReviews(product.stores, host);
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
    .select("id,customer_id,product_id,quantity,products(id,name,price,currency,stock_quantity,image_url,store_id,stores(name,delivery_fee))")
    .eq("customer_id", currentUser.id).order("created_at", { ascending: false });
  if (error) { console.warn("Cart load failed:", error.message); return; }
  cartItems = (data || []).filter((item) => item.products);
  $("#cart-count").textContent = String(cartItems.reduce((sum,item) => sum + Number(item.quantity || 0),0));
}
function getCartPricing() {
  let subtotal = 0;
  const stores = new Map();
  cartItems.forEach((item) => {
    const product = item.products;
    const quantity = Number(item.quantity || 0);
    subtotal += Number(product.price || 0) * quantity;
    const store = Array.isArray(product.stores) ? product.stores[0] : product.stores;
    const storeId = product.store_id || item.product_id;
    if (!stores.has(storeId)) {
      stores.set(storeId, {
        id: storeId,
        name: store?.name || "المتجر",
        fee: Math.max(0, Number(store?.delivery_fee || 0))
      });
    }
  });
  const deliveryFee = [...stores.values()].reduce((sum, store) => sum + store.fee, 0);
  return { subtotal, stores: [...stores.values()], deliveryFee, total: subtotal + deliveryFee };
}
function renderPricingBreakdown(host, pricing, totalLabel = "الإجمالي المتوقع") {
  host.replaceChildren();
  host.classList.add("cart-total-breakdown");
  const addRow = (labelText, value, emphasis = false) => {
    const row = document.createElement("div");
    row.className = "checkout-cost-row" + (emphasis ? " is-total" : "");
    const label = document.createElement("span"); label.textContent = labelText;
    const amount = document.createElement("strong"); amount.textContent = money(value);
    row.append(label, amount); host.append(row);
  };
  addRow("مجموع المنتجات", pricing.subtotal);
  pricing.stores.forEach((store) => addRow("أجرة التوصيل — " + store.name, store.fee));
  addRow(totalLabel, pricing.total, true);
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
  const pricing = getCartPricing();
  cartItems.forEach((item) => {
    const product = item.products; const quantity = Number(item.quantity);
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
    const lineTotal = document.createElement("span"); lineTotal.className = "cart-row-price"; lineTotal.textContent = money(Number(product.price) * quantity);
    row.append(info, lineTotal); host.append(row);
  });
  renderPricingBreakdown($("#cart-total"), pricing, "الإجمالي مع التوصيل");
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
      .select("id,order_number,status,subtotal,delivery_fee,total,customer_name,customer_phone,shipping_address,notes,created_at,order_items(id,store_id,product_id,product_name,unit_price,quantity,line_total)")
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
    const historyByOrder = new Map();
    try {
      const { data: historyRows, error: historyError } = await db.from("order_status_history")
        .select("id,order_id,status,note,created_at")
        .in("order_id", orders.map((order) => order.id))
        .order("created_at", { ascending: true });
      if (historyError) throw historyError;
      (historyRows || []).forEach((event) => {
        if (!historyByOrder.has(event.order_id)) historyByOrder.set(event.order_id, []);
        historyByOrder.get(event.order_id).push(event);
      });
    } catch (historyError) {
      console.warn("Order status history unavailable:", historyError);
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
      const headActions = document.createElement("div");
      headActions.className = "order-history-head-actions";
      headActions.append(status);
      if (order.status === "pending") {
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "cancel-customer-order";
        cancel.textContent = "إلغاء الطلب";
        cancel.addEventListener("click", () => cancelCustomerOrder(order, cancel));
        headActions.append(cancel);
      }
      head.append(identity, headActions);
      const progress = document.createElement("div");
      progress.className = "order-progress";
      const stages = [
        { key: "pending", label: "قيد الانتظار" },
        { key: "processing", label: "قيد التجهيز" },
        { key: "shipped", label: "قيد التوصيل" },
        { key: "delivered", label: "مكتمل" }
      ];
      const orderHistory = historyByOrder.get(order.id) || [];
      const stageIndex = stages.findIndex((stage) => stage.key === order.status);
      const formatStatusDate = (value) => {
        if (!value) return "";
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString("ar-IQ", { dateStyle: "short", timeStyle: "short" });
      };
      stages.forEach((stage, index) => {
        const step = document.createElement("div");
        step.className = "order-progress-step";
        if (order.status === "cancelled") step.classList.add("is-cancelled");
        else if (stageIndex >= 0 && index < stageIndex) step.classList.add("is-complete");
        else if (index === stageIndex) step.classList.add("is-current");
        const dot = document.createElement("span");
        dot.className = "order-progress-dot";
        const label = document.createElement("small");
        label.textContent = stage.label;
        step.append(dot, label);
        const event = orderHistory.find((entry) => entry.status === stage.key);
        if (event) {
          const time = document.createElement("time");
          time.className = "order-progress-time";
          time.dateTime = event.created_at;
          time.textContent = formatStatusDate(event.created_at);
          time.title = event.note || stage.label;
          step.append(time);
        }
        progress.append(step);
      });
      if (orderHistory.length) {
        const historySummary = document.createElement("p");
        historySummary.className = "order-status-last-update";
        const lastEvent = orderHistory[orderHistory.length - 1];
        historySummary.textContent = (lastEvent.note || "آخر تحديث للحالة") + " · " + formatStatusDate(lastEvent.created_at);
        progress.append(historySummary);
      }
      if (order.status === "cancelled") {
        const cancelled = document.createElement("p");
        cancelled.className = "order-cancelled-note";
        cancelled.textContent = "تم إلغاء هذا الطلب.";
        progress.replaceChildren(cancelled);
      }
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
        if (currentUser && currentRole === "customer" && order.status === "delivered" && item.product_id) {
          const rateButton = document.createElement("button");
          rateButton.type = "button";
          rateButton.className = "order-rate-product";
          rateButton.textContent = "★ تقييم المنتج";
          rateButton.addEventListener("click", () => {
            const product = allProducts.find((entry) => String(entry.id) === String(item.product_id));
            if (!product) {
              toast("لا يمكن فتح المنتج من السوق حالياً. يمكنك البحث عنه في السوق لتقييمه.");
              return;
            }
            $("#order-history-dialog").close();
            showProductDetails(product);
            $("#product-dialog").scrollTop = 0;
          });
          details.append(rateButton);
        }
        if (currentUser && currentRole === "customer" && order.status === "delivered" && item.store_id) {
          const storeRateButton = document.createElement("button");
          storeRateButton.type = "button";
          storeRateButton.className = "order-rate-store";
          storeRateButton.textContent = "★ تقييم المتجر";
          storeRateButton.addEventListener("click", () => {
            const storeProduct = allProducts.find((entry) => String(entry.store_id) === String(item.store_id) && entry.stores);
            if (!storeProduct?.stores) {
              toast("تعذر فتح صفحة المتجر حالياً. افتح المتجر من السوق ثم انتقل إلى تقييماته.");
              return;
            }
            window.location.href = storeHref(storeProduct.stores);
          });
          details.append(storeRateButton);
        }
        itemsHost.append(row);
      });
      const footer = document.createElement("div");
      footer.className = "order-history-card-footer";
      const address = document.createElement("span");
      address.textContent = "عنوان التوصيل: " + (order.shipping_address || "غير مسجل");
      const subtotalLabel = document.createElement("span");
      subtotalLabel.textContent = "مجموع المنتجات: " + money(order.subtotal == null ? total : order.subtotal);
      const deliveryLabel = document.createElement("span");
      deliveryLabel.textContent = "أجرة التوصيل: " + money(order.delivery_fee || 0);
      const totalLabel = document.createElement("strong");
      totalLabel.textContent = "الإجمالي: " + money(order.total == null ? total + Number(order.delivery_fee || 0) : order.total);
      footer.append(address, subtotalLabel, deliveryLabel, totalLabel);
      card.append(head, progress, itemsHost, footer);
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
async function cancelCustomerOrder(order, button) {
  if (order.status !== "pending") {
    toast("لا يمكن إلغاء الطلب بعد بدء تجهيزه.");
    return;
  }
  const orderLabel = "#BB-" + order.order_number;
  if (!window.confirm("هل تريد إلغاء الطلب " + orderLabel + "؟ ستُعاد الكميات إلى مخزون المتجر.")) return;
  button.disabled = true;
  button.textContent = "جارٍ الإلغاء...";
  try {
    const { data, error } = await db.rpc("cancel_customer_order", { p_order_id: order.id });
    if (error) throw error;
    if (!data?.success || data.status !== "cancelled") throw new Error("لم يصل تأكيد الإلغاء من النظام.");
    toast("تم إلغاء الطلب " + orderLabel + " وإعادة الكمية إلى المخزون.");
    await Promise.all([loadOrderHistory(), initMarket()]);
  } catch (error) {
    console.error("Order cancellation failed:", error);
    toast(error.message || "تعذر إلغاء الطلب. حدّث القائمة وحاول مجدداً.");
    button.disabled = false;
    button.textContent = "إلغاء الطلب";
  }
}
async function openOrderHistory() {
  if (!currentUser) {
    toast("سجّل الدخول أولاً لعرض الطلبات.");
    window.location.href = "index.html";
    return;
  }
  if (currentRole === "merchant") {
    toast("جارٍ فتح طلبات متجرك.");
    window.location.href = "seller.html?view=orders";
    return;
  }
  if (currentRole !== "customer") {
    toast("تعذر تحديد نوع الحساب. سجّل الدخول مجدداً.");
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
  if (!$("#checkout-name").value.trim()) $("#checkout-name").value = currentProfile?.full_name || "";
  if (!$("#checkout-phone").value.trim()) $("#checkout-phone").value = currentProfile?.phone || "";
  if (!$("#checkout-address").value.trim()) $("#checkout-address").value = currentProfile?.default_shipping_address || "";
  renderPricingBreakdown($("#checkout-cost-summary"), getCartPricing(), "الإجمالي المتوقع");
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
      const profileResult = await db.from("profiles").select("role,full_name,phone,default_shipping_address").eq("id", currentUser.id).maybeSingle();
      currentRole = profileResult.data?.role || null;
      currentProfile = profileResult.data || null;
      if (currentRole === "merchant" && !isStorePage) { window.location.href = "seller.html"; return; }
      $("#account-label").textContent = profileResult.data?.full_name || "حسابي";
      $("#account-button").title = "الملف الشخصي";
    }
    await loadFavoriteIds();
    await loadCampaigns();
    if (isFavoritesPage) {
      document.body.classList.add("favorites-page");
      document.title = "BBen | منتجاتي المفضلة";
      $(".market-hero").classList.add("hidden");
      $(".market-categories").classList.add("hidden");
      $("#market-stores-section").classList.add("hidden");
      $("#market-promo-strip").classList.add("hidden");
      $(".market-benefits").classList.add("hidden");
      $("#products-section h2").textContent = "منتجاتي المفضلة";
      $(".product-heading .section-eyebrow").textContent = "محفوظة لك";
      $("#favorite-filter-button").textContent = "← العودة إلى السوق";
      $("#favorite-filter-button").classList.add("favorites-back-button");
    }
    if (isStorePage) {
      $("#market-stores-section").classList.add("hidden");
      $("#market-promo-strip").classList.add("hidden");
      $("#store-public-hero").classList.remove("hidden");
      document.querySelector(".market-hero").classList.add("hidden");
      document.querySelector(".section-heading:not(.product-heading) h2").textContent = "تصنيفات المتجر";
      document.querySelector("#products-section h2").textContent = "منتجات هذا المتجر";
      document.querySelector("#public-store-browse-button").addEventListener("click", () => $("#products-section").scrollIntoView({ behavior: "smooth" }));
      if (!requestedStoreId) {
        $("#public-store-name").textContent = "رابط المتجر غير مكتمل";
        $("#public-store-description").textContent = "افتح صفحة المتجر من خلال رابط المتجر الموجود في السوق.";
        $("#market-message").textContent = "لم يتم تحديد المتجر المطلوب.";
        $("#market-message").classList.remove("hidden");
        $("#product-grid").replaceChildren();
        $("#results-summary").textContent = "لا يوجد متجر محدد";
        return;
      }
      const storeResult = await db.from("stores")
        .select("id,name,slug,description,logo_url,phone,city,status,delivery_fee")
        .eq("id", requestedStoreId).eq("status", "active").maybeSingle();
      if (storeResult.error) throw storeResult.error;
      publicStore = storeResult.data;
      if (!publicStore) {
        $("#public-store-name").textContent = "المتجر غير متاح";
        $("#public-store-description").textContent = "قد يكون المتجر غير نشط أو أن الرابط لم يعد صالحاً.";
        $("#market-message").textContent = "هذا المتجر غير متاح حالياً.";
        $("#market-message").classList.remove("hidden");
        $("#market-message").classList.add("error");
        $("#product-grid").replaceChildren();
        $("#results-summary").textContent = "المتجر غير متاح";
        return;
      }
      document.title = "BBen | " + publicStore.name;
      $("#public-store-name").textContent = publicStore.name || "متجر BBen";
      $("#public-store-location").textContent = publicStore.city || "";
      $("#public-store-description").textContent = publicStore.description || "مرحباً بك في متجرنا. تصفح المنتجات المتاحة واختر ما يناسبك.";
      $("#public-store-delivery-fee").textContent = "أجرة التوصيل: " + money(publicStore.delivery_fee || 0);

      if (publicStore.logo_url) {
        const logo = document.createElement("img");
        logo.src = publicStore.logo_url; logo.alt = "شعار " + publicStore.name;
        $("#public-store-logo").replaceChildren(logo);
      }
      if (publicStore.phone) {
        const phone = $("#public-store-phone");
        phone.href = "tel:" + publicStore.phone.replace(/[^+0-9]/g, "");
        phone.textContent = "اتصل بالمتجر";
        phone.hidden = false;
      }
      $("#public-store-browse-button").textContent = "تصفح المنتجات ↓";
    }
    const [categoryResult, productQuery] = await Promise.all([
      db.from("categories").select("id,name,slug").order("name"),
      (() => {
        let query = db.from("products").select("id,name,description,price,currency,stock_quantity,image_url,status,category_id,store_id,created_at,categories(name),stores(id,name,slug,description,logo_url,phone,city,status,delivery_fee),product_images(id,image_url,sort_order)").eq("status","active").gt("stock_quantity",0).order("created_at",{ascending:false});
        if (isStorePage) query = query.eq("store_id", requestedStoreId);
        return query;
      })()
    ]);
    if (categoryResult.error) throw categoryResult.error;
    if (productQuery.error) throw productQuery.error;
    allCategories = categoryResult.data || [];
    allProducts = (productQuery.data || []).filter((p) => p.stores?.status === "active");
    const storeReviewResult = await db.from("store_reviews").select("store_id,rating");
    if (storeReviewResult.error) throw storeReviewResult.error;
    const storeRatingMap = new Map();
    (storeReviewResult.data || []).forEach((review) => { const entry = storeRatingMap.get(review.store_id) || {count:0,sum:0}; entry.count++; entry.sum += Number(review.rating); storeRatingMap.set(review.store_id,entry); });
    allProducts.forEach((product) => { const entry = storeRatingMap.get(product.store_id); if (product.stores) { product.stores.store_review_count = entry?.count || 0; product.stores.store_review_average = entry ? entry.sum / entry.count : 0; } });
    if (publicStore) { const entry = storeRatingMap.get(publicStore.id); publicStore.store_review_count = entry?.count || 0; publicStore.store_review_average = entry ? entry.sum / entry.count : 0; const slot = $("#public-store-rating"); if (slot) slot.replaceChildren(storeRatingSummary(publicStore)); }
    const reviewResult = await db.from("product_reviews").select("product_id,rating");
    if (reviewResult.error) throw reviewResult.error;
    const ratingMap = new Map();
    (reviewResult.data || []).forEach((review) => { const entry = ratingMap.get(review.product_id) || { count: 0, sum: 0 }; entry.count++; entry.sum += Number(review.rating); ratingMap.set(review.product_id, entry); });
    allProducts.forEach((product) => { const entry = ratingMap.get(product.id); product.review_count = entry?.count || 0; product.review_average = entry ? entry.sum / entry.count : 0; });
    renderStores();
    if (isStorePage) { $("#public-store-products-count").textContent = allProducts.length + " منتج متاح"; if (publicStore && $("#public-store-rating")) { $("#public-store-rating").classList.remove("hidden"); $("#public-store-rating").replaceChildren(storeRatingSummary(publicStore)); loadStoreReviews(publicStore, $("#public-store-rating")); } }
    renderCategories(); renderCities(); renderProducts(); await loadCart();
    if (window.location.hash === "#orders" && currentRole === "customer") await openOrderHistory();
  } catch (error) {
    console.error("Market load failed:", error);
    $("#market-message").textContent = "تعذر تحميل المنتجات من قاعدة البيانات: " + (error.message || "خطأ غير معروف");
    $("#market-message").classList.remove("hidden"); $("#market-message").classList.add("error");
  }
}
$("#search-input").addEventListener("input", renderProducts);
$("#clear-search").addEventListener("click", () => { $("#search-input").value = ""; renderProducts(); $("#search-input").focus(); });
$("#sort-select").addEventListener("change", renderProducts);
$("#city-filter")?.addEventListener("change", () => { activeCity = $("#city-filter").value; renderProducts(); });
$("#browse-button").addEventListener("click", openCampaignTarget);
$("#campaign-prev")?.addEventListener("click", () => { if (marketCampaigns.length > 1) { renderCampaign((activeCampaignIndex - 1 + marketCampaigns.length) % marketCampaigns.length); restartCampaignTimer(); } });
$("#campaign-next")?.addEventListener("click", () => { if (marketCampaigns.length > 1) { renderCampaign((activeCampaignIndex + 1) % marketCampaigns.length); restartCampaignTimer(); } });
$("#show-all-categories").addEventListener("click", () => { activeCategory = ""; renderCategories(); renderProducts(); });
$("#favorite-filter-button").addEventListener("click", () => {
  if (isFavoritesPage) { window.location.href = "market.html"; return; }
  showFavoritesOnly = !showFavoritesOnly;
  renderProducts();
  if (showFavoritesOnly) $("#products-section").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("#promo-strip-browse-button")?.addEventListener("click", () => $("#products-section").scrollIntoView({ behavior: "smooth", block: "start" }));
$("#dismiss-promo")?.addEventListener("click", () => { $("#market-promo").hidden = true; });
$("#mobile-nav-browse")?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
$("#mobile-nav-orders")?.addEventListener("click", openOrderHistory);
$("#mobile-nav-cart")?.addEventListener("click", openCart);
$("#mobile-nav-account")?.addEventListener("click", () => { window.location.href = currentUser && currentRole === "customer" ? "customer-profile.html" : "index.html"; });
$("#favorites-page-button")?.addEventListener("click", () => { window.location.href = "market.html?view=favorites"; });
$("#account-button").addEventListener("click", async () => {
  if (currentUser && currentRole === "customer") { window.location.href = "customer-profile.html"; return; }
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
$("#close-chat-dialog").addEventListener("click", () => { stopChatAutoRefresh(); $("#chat-dialog").close(); });
$("#chat-dialog").addEventListener("close", stopChatAutoRefresh);
$("#chat-form").addEventListener("submit", sendChatMessage);
$("#chat-refresh-button")?.addEventListener("click", async () => {
  try { await loadChatMessages(); }
  catch (error) { toast("تعذر تحديث الرسائل: " + (error.message || "حاول مجدداً.")); }
});
$("#close-cart-dialog").addEventListener("click", () => $("#cart-dialog").close());
$("#continue-shopping").addEventListener("click", () => $("#cart-dialog").close());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { if ($("#product-dialog").open) $("#product-dialog").close(); if ($("#cart-dialog").open) $("#cart-dialog").close(); if ($("#checkout-dialog").open) $("#checkout-dialog").close(); if ($("#order-history-dialog").open) $("#order-history-dialog").close(); if ($("#chat-dialog").open) $("#chat-dialog").close(); }
});


initMarket();