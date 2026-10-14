const db=window.bbenSupabase;
const $=s=>document.querySelector(s);
const money=v=>new Intl.NumberFormat("ar-IQ").format(Number(v)||0)+" د.ع";
let rows=[];
let storeRows=[];
const expandedStores=new Set();
async function start(){
 const {data:{session}}=await db.auth.getSession();
 if(!session){$("#access-state").textContent="سجّل الدخول أولاً";return}
 const p=await db.from("profiles").select("role").eq("id",session.user.id).single();
 if(p.error||p.data.role!=="admin"){$("#access-state").textContent="هذه الصفحة لمسؤول المنصة فقط";return}
 $("#access-state").classList.add("hidden");$("#platform-content").classList.remove("hidden");await load();
}
async function load(){
 $("#connection-status").textContent="جارٍ تحديث البيانات...";
 const a=await db.rpc("admin_dashboard_summary");
 const b=await db.rpc("admin_list_merchants");
 const c=await db.rpc("admin_list_commission_ledger");
 if(a.error||b.error||c.error){
  const failures=[["ملخص المنصة",a.error],["قائمة التجار",b.error],["سجل العمولات",c.error]].filter(([,e])=>e);
  console.error("BBen admin RPC failure:",failures);
  const first=failures[0];
  $("#connection-status").textContent="تعذر تحميل "+first[0]+": "+(first[1].message||first[1].details||first[1].code||"خطأ غير معروف");
  return;
 }
 const d=a.data;
 document.querySelector("#merchant-count").textContent=d.merchant_count;
 document.querySelector("#store-count").textContent=d.store_count+" متجر";
 document.querySelector("#active-products").textContent=d.active_product_count;
 document.querySelector("#all-products").textContent=d.product_count+" إجمالي المنتجات";
 document.querySelector("#order-count").textContent=d.order_count;
 document.querySelector("#pending-count").textContent=d.pending_order_count+" بانتظار المعالجة";
 document.querySelector("#completed-sales").textContent=money(d.completed_product_sales);
 document.querySelector("#commission-due").textContent=money(d.commission_due);
 document.querySelector("#eligible-count").textContent=d.eligible_completed_orders+" طلب مكتمل مؤهل";
 document.querySelector("#delivery-fees").textContent=money(d.completed_delivery_fees);
 document.querySelector("#delivered-count").textContent=d.delivered_order_count+" طلب مكتمل";
 storeRows=b.data||[];renderStores(storeRows);rows=c.data||[];renderLedger();await Promise.all([loadCampaigns(),loadCoupons()]);$("#connection-status").textContent="البيانات محدثة";
}


async function loadCoupons(){
 const body=$("#coupons-table");if(!body)return;
 const {data,error}=await db.from("coupons").select("*").order("created_at",{ascending:false});
 body.replaceChildren();
 if(error){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=6;td.textContent="تعذر تحميل الكوبونات: "+(error.message||"");tr.append(td);body.append(tr);return;}
 if(!data?.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=6;td.textContent="لا توجد كوبونات بعد.";tr.append(td);body.append(tr);return;}
 data.forEach(c=>{
  const tr=document.createElement("tr");
  const code=document.createElement("td");const strong=document.createElement("strong");strong.textContent=c.code;const desc=document.createElement("small");desc.textContent=c.description||"";code.append(strong,desc);tr.append(code);
  const discount=document.createElement("td");discount.textContent=(c.discount_type==="percent"?c.discount_value+"%":money(c.discount_value))+(c.max_discount? " · حد "+money(c.max_discount):"");tr.append(discount);
  const funding=document.createElement("td");funding.textContent=c.funding_source==="platform"?"BBen":"التاجر";tr.append(funding);
  const usage=document.createElement("td");usage.textContent=String(c.usage_count||0)+(c.total_usage_limit?"/"+c.total_usage_limit:"");tr.append(usage);
  const statusCell=document.createElement("td");statusCell.textContent=c.is_active?"مفعّل":"متوقف";tr.append(statusCell);
  const actionCell=document.createElement("td"),toggle=document.createElement("button");toggle.type="button";toggle.className="store-action "+(c.is_active?"danger":"primary");toggle.textContent=c.is_active?"إيقاف":"تفعيل";
  toggle.addEventListener("click",async()=>{toggle.disabled=true;try{const {error}=await db.from("coupons").update({is_active:!c.is_active,updated_at:new Date().toISOString()}).eq("id",c.id);if(error)throw error;await loadCoupons();}catch(e){alert("تعذر تغيير حالة الكوبون: "+(e.message||""));toggle.disabled=false;}});
  actionCell.append(toggle);tr.append(actionCell);body.append(tr);
 });
}
async function saveCoupon(event){
 event.preventDefault();const message=$("#coupon-form-message"),button=$("#coupon-save-button");
 const code=$("#coupon-code-input").value.trim().toUpperCase();
 const type=$("#coupon-type-input").value,value=Number($("#coupon-value-input").value),maxRaw=$("#coupon-max-input").value;
 const starts=$("#coupon-start-input").value,ends=$("#coupon-end-input").value;
 const startIso=starts?new Date(starts).toISOString():null,endIso=ends?new Date(ends).toISOString():null;
 if(!/^[A-Z0-9_-]{2,40}$/.test(code)){message.textContent="استخدم أحرفاً إنجليزية وأرقاماً أو - أو _ فقط.";return;}
 if(!(value>0)||(type==="percent"&&value>100)){message.textContent="تحقق من قيمة الخصم؛ النسبة لا تتجاوز 100%.";return;}
 if(startIso&&endIso&&new Date(endIso)<=new Date(startIso)){message.textContent="تاريخ النهاية يجب أن يكون بعد البداية.";return;}
 const payload={code,description:$("#coupon-description-input").value.trim(),discount_type:type,discount_value:value,max_discount:maxRaw?Number(maxRaw):null,min_subtotal:Math.max(0,Number($("#coupon-min-input").value)||0),funding_source:$("#coupon-funding-input").value,starts_at:startIso,ends_at:endIso,total_usage_limit:$("#coupon-total-limit-input").value?Number($("#coupon-total-limit-input").value):null,per_customer_limit:Math.max(1,Number($("#coupon-user-limit-input").value)||1),is_active:$("#coupon-active-input").checked,created_by:currentAdminId};
 button.disabled=true;message.textContent="جارٍ إنشاء الكوبون...";
 try{const {error}=await db.from("coupons").insert(payload);if(error)throw error;$("#coupon-form").reset();$("#coupon-user-limit-input").value="1";$("#coupon-min-input").value="0";message.textContent="تم إنشاء الكوبون.";await loadCoupons();}
 catch(e){message.textContent="تعذر إنشاء الكوبون: "+(e.message||"تحقق من البيانات والصلاحيات.");}
 finally{button.disabled=false;}
}
async function sendPlatformNotification(event){
 event.preventDefault();const button=$("#notification-send-button"),message=$("#notification-form-message");
 const target=$("#notification-url-input").value.trim();
 if(target&&(target.startsWith("..")||/^(?:https?:)?\/\//i.test(target)||/^javascript:/i.test(target)||/[\r\n]/.test(target))){message.textContent="استخدم رابطاً داخلياً آمناً فقط.";return;}
 button.disabled=true;
 try{const {error}=await db.from("notifications").insert({target_role:$("#notification-role-input").value,title:$("#notification-title-input").value.trim(),body:$("#notification-body-input").value.trim(),target_url:target||null,notification_type:"platform",created_by:currentAdminId});if(error)throw error;$("#notification-form").reset();message.textContent="تم إرسال الإشعار.";}
 catch(e){message.textContent="تعذر إرسال الإشعار: "+(e.message||"تحقق من الصلاحيات.");}
 finally{button.disabled=false;}
}

function campaignDateInput(value){
 if(!value)return "";
 const d=new Date(value);if(Number.isNaN(d.getTime()))return "";
 return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
function campaignDateLabel(value){
 if(!value)return "بدون تحديد";
 const d=new Date(value);return Number.isNaN(d.getTime())?"—":d.toLocaleString("ar-IQ",{dateStyle:"short",timeStyle:"short"});
}
function resetCampaignForm(){
 $("#campaign-form").reset();
 $("#campaign-id").value="";
 $("#campaign-button-input").value="تسوّق الآن";
 $("#campaign-target-input").value="market.html";
 $("#campaign-order-input").value="0";
 $("#campaign-save-button").textContent="حفظ الحملة";
 $("#campaign-cancel-edit").hidden=true;
 $("#campaign-form-message").textContent="";
}
async function loadCampaigns(){
 const body=$("#campaigns-table");
 if(!body)return;
 const {data,error}=await db.from("marketing_campaigns").select("*").order("sort_order",{ascending:true}).order("created_at",{ascending:false});
 if(error){
  console.error("Could not load campaigns:",error);
  body.replaceChildren();
  const tr=document.createElement("tr"),td=document.createElement("td");
  td.colSpan=5;td.textContent="تعذر تحميل الحملات: "+(error.message||"تحقق من صلاحيات المدير.");
  tr.append(td);body.append(tr);return;
 }
 campaignRows=data||[];
 renderCampaigns();
}
function renderCampaigns(){
 const body=$("#campaigns-table");body.replaceChildren();
 if(!campaignRows.length){
  const tr=document.createElement("tr"),td=document.createElement("td");
  td.colSpan=5;td.textContent="لا توجد حملات بعد. أنشئ أول حملة من النموذج أعلاه.";
  tr.append(td);body.append(tr);return;
 }
 campaignRows.forEach(c=>{
  const tr=document.createElement("tr");
  const titleCell=document.createElement("td");
  const title=document.createElement("strong");title.textContent=c.title;
  const subtitle=document.createElement("small");subtitle.className="campaign-table-subtitle";subtitle.textContent=c.subtitle||"بدون وصف";
  titleCell.append(title,subtitle);tr.append(titleCell);
  const statusCell=document.createElement("td");
  const now=Date.now(),started=!c.starts_at||new Date(c.starts_at).getTime()<=now,notEnded=!c.ends_at||new Date(c.ends_at).getTime()>now;
  const status=document.createElement("span");status.className="status "+(c.is_active&&started&&notEnded?"campaign-active":"campaign-inactive");
  status.textContent=c.is_active?(started&&notEnded?"مفعّلة":"مفعّلة خارج المدة"):"متوقفة";statusCell.append(status);tr.append(statusCell);
  const order=document.createElement("td");order.textContent=String(c.sort_order??0);tr.append(order);
  const period=document.createElement("td");period.textContent=campaignDateLabel(c.starts_at)+" — "+campaignDateLabel(c.ends_at);tr.append(period);
  const actionsCell=document.createElement("td"),actions=document.createElement("div");actions.className="store-actions";
  const edit=document.createElement("button");edit.type="button";edit.className="store-action details";edit.textContent="تعديل";
  edit.addEventListener("click",()=>{
   $("#campaign-id").value=c.id;
   $("#campaign-title-input").value=c.title||"";
   $("#campaign-subtitle-input").value=c.subtitle||"";
   $("#campaign-image-input").value=c.image_url||"";
   $("#campaign-button-input").value=c.button_label||"تسوّق الآن";
   $("#campaign-target-input").value=c.target_url||"market.html";
   $("#campaign-order-input").value=String(c.sort_order??0);
   $("#campaign-start-input").value=campaignDateInput(c.starts_at);
   $("#campaign-end-input").value=campaignDateInput(c.ends_at);
   $("#campaign-active-input").checked=Boolean(c.is_active);
   $("#campaign-save-button").textContent="حفظ التعديلات";
   $("#campaign-cancel-edit").hidden=false;
   $("#campaign-form-message").textContent="تعديل الحملة: "+c.title;
   $("#campaign-form").scrollIntoView({behavior:"smooth",block:"center"});
  });
  const toggle=document.createElement("button");toggle.type="button";toggle.className="store-action "+(c.is_active?"danger":"primary");toggle.textContent=c.is_active?"إيقاف":"تفعيل";
  toggle.addEventListener("click",async()=>{
   toggle.disabled=true;
   try{
    const {error}=await db.from("marketing_campaigns").update({is_active:!c.is_active}).eq("id",c.id);
    if(error)throw error;
    await loadCampaigns();
   }catch(error){alert("تعذر تغيير حالة الحملة: "+(error.message||"حاول مجدداً."));toggle.disabled=false;}
  });
  const del=document.createElement("button");del.type="button";del.className="store-action danger";del.textContent="حذف";
  del.addEventListener("click",async()=>{
   if(!globalThis.confirm("هل تريد حذف الحملة «"+c.title+"»؟"))return;
   del.disabled=true;
   try{const {error}=await db.from("marketing_campaigns").delete().eq("id",c.id);if(error)throw error;await loadCampaigns();if($("#campaign-id").value===c.id)resetCampaignForm();}
   catch(error){alert("تعذر حذف الحملة: "+(error.message||"حاول مجدداً."));del.disabled=false;}
  });
  actions.append(edit,toggle,del);actionsCell.append(actions);tr.append(actionsCell);body.append(tr);
 });
}
async function saveCampaign(event){
 event.preventDefault();
 const message=$("#campaign-form-message"),button=$("#campaign-save-button");
 const title=$("#campaign-title-input").value.trim();
 const imageUrl=$("#campaign-image-input").value.trim();
 const target=safeCampaignTargetAdmin($("#campaign-target-input").value);
 if(!title){message.textContent="أدخل عنوان الحملة.";return;}
 if(imageUrl){try{const url=new URL(imageUrl);if(!["https:","http:"].includes(url.protocol))throw new Error();}catch{message.textContent="رابط الصورة يجب أن يبدأ بـ https:// أو http://";return;}}
 if(!target){message.textContent="وجهة الزر يجب أن تكون مساراً داخلياً مثل market.html أو #products-section.";return;}
 const starts=$("#campaign-start-input").value,ends=$("#campaign-end-input").value;
 const startIso=starts?new Date(starts).toISOString():null,endIso=ends?new Date(ends).toISOString():null;
 if(startIso&&endIso&&new Date(endIso)<=new Date(startIso)){message.textContent="تاريخ نهاية الحملة يجب أن يكون بعد بدايتها.";return;}
 const id=$("#campaign-id").value;
 const payload={
  title,subtitle:$("#campaign-subtitle-input").value.trim(),image_url:imageUrl||null,
  button_label:$("#campaign-button-input").value.trim()||"تسوّق الآن",target_url:target,
  sort_order:Math.max(0,Number($("#campaign-order-input").value)||0),
  starts_at:startIso,ends_at:endIso,is_active:$("#campaign-active-input").checked
 };
 if(!id)payload.created_by=currentAdminId;
 button.disabled=true;button.textContent="جارٍ الحفظ...";
 try{
  const result=id?await db.from("marketing_campaigns").update(payload).eq("id",id):await db.from("marketing_campaigns").insert(payload);
  if(result.error)throw result.error;
  const successMessage=id?"تم تحديث الحملة.":"تم إنشاء الحملة.";
  resetCampaignForm();await loadCampaigns();message.textContent=successMessage;
 }catch(error){message.textContent="تعذر حفظ الحملة: "+(error.message||"تحقق من البيانات والصلاحيات.");}
 finally{button.disabled=false;button.textContent=$("#campaign-id").value?"حفظ التعديلات":"حفظ الحملة";}
}
function safeCampaignTargetAdmin(value){
 const target=String(value||"").trim();
 if(!target||/^(?:https?:)?\/\//i.test(target)||/^javascript:/i.test(target)||target.startsWith("..")||target.includes(":")||/[\r\n\s]/.test(target))return "";
 return /^(?:#[a-zA-Z][\w-]*|[a-zA-Z0-9_./?=&%-]+)$/.test(target)?target:"";
}
function renderStores(data){
 const body=$("#stores-table");body.replaceChildren();
 const query=($("#store-search")?.value||"").trim().toLocaleLowerCase("ar");
 const statusFilter=$("#store-status-filter")?.value||"all";
 const filtered=data.filter(s=>(statusFilter==="all"||s.store_status===statusFilter)&&[s.store_name,s.owner_name,s.owner_phone,s.city].some(v=>String(v||"").toLocaleLowerCase("ar").includes(query)));
 if(!filtered.length){const tr=document.createElement("tr");const td=document.createElement("td");td.colSpan=7;td.textContent=query?"لا توجد نتائج مطابقة للبحث.":"لا توجد متاجر.";tr.append(td);body.append(tr);return}
 filtered.forEach(s=>{
  const tr=document.createElement("tr");
  [(s.store_name||"متجر")+" — "+(s.owner_name||"غير مسجل"),s.store_status==="active"?"نشط":s.store_status==="suspended"?"موقوف":"غير معروف",Number(s.active_product_count||0)+" / "+Number(s.product_count||0),Number(s.order_count||0),money(s.completed_sales),money(s.commission_due)].forEach((v,i)=>{
   const td=document.createElement("td");td.textContent=v;
   if(i===1){const badge=document.createElement("span");badge.className="status "+(s.store_status==="active"?"store-active":s.store_status==="suspended"?"store-suspended":"");badge.textContent=v;td.replaceChildren(badge)}
   tr.append(td);
  });
  const actionCell=document.createElement("td");
  const detail=document.createElement("button");detail.type="button";detail.className="store-action details";
  detail.textContent=expandedStores.has(s.store_id)?"إخفاء التفاصيل":"تفاصيل التاجر";
  detail.setAttribute("aria-expanded",String(expandedStores.has(s.store_id)));
  detail.addEventListener("click",()=>{
   if(expandedStores.has(s.store_id))expandedStores.delete(s.store_id);else expandedStores.add(s.store_id);
   renderStores(storeRows);
  });
  const action=document.createElement("button");action.type="button";
  action.className="store-action "+(s.store_status==="active"?"danger":"primary");
  action.textContent=s.store_status==="active"?"إيقاف المتجر":s.store_status==="suspended"?"إعادة التفعيل":"حالة غير مدعومة";
  action.disabled=!["active","suspended"].includes(s.store_status);
  action.addEventListener("click",()=>changeStoreStatus(s,action));
  const actions=document.createElement("div");actions.className="store-actions";actions.append(detail,action);actionCell.append(actions);tr.append(actionCell);body.append(tr);
  if(expandedStores.has(s.store_id)){
   const detailRow=document.createElement("tr");detailRow.className="store-detail-row";
   const detailCell=document.createElement("td");detailCell.colSpan=7;
   const panel=document.createElement("div");panel.className="store-detail-grid";
   const fields=[
    ["اسم المتجر",s.store_name||"—"],["اسم التاجر",s.owner_name||"غير مسجل"],
    ["هاتف التاجر",s.owner_phone||"غير مسجل"],["المدينة",s.city||"غير محددة"],
    ["أجرة التوصيل",money(s.delivery_fee)],["الطلبات المكتملة المؤهلة للعمولة",Number(s.commission_eligible_orders||0)],
    ["إجمالي المنتجات",Number(s.product_count||0)],["المنتجات النشطة",Number(s.active_product_count||0)]
   ];
   fields.forEach(([label,value])=>{const item=document.createElement("div");item.className="store-detail-item";const strong=document.createElement("strong");strong.textContent=label;const span=document.createElement("span");span.textContent=String(value);item.append(strong,span);panel.append(item)});
   detailCell.append(panel);detailRow.append(detailCell);body.append(detailRow);
  }
 });
}
async function changeStoreStatus(store,button){
 const next=store.store_status==="active"?"suspended":"active";
 const actionText=next==="suspended"?"إيقاف":"إعادة تفعيل";
 const warning=next==="suspended"
  ?"سيختفي المتجر من واجهة التسوق، ولن تُقبل طلبات جديدة منه. الطلبات السابقة والمخزون لن يتغيرا. هل تريد المتابعة؟"
  :"سيظهر المتجر مجدداً في واجهة التسوق ويمكن استقبال طلبات جديدة. لن تتغير الطلبات السابقة أو كميات المخزون. هل تريد المتابعة؟";
 if(!window.confirm("هل تريد "+actionText+" متجر «"+store.store_name+"»؟\n\n"+warning))return;
 const originalText=button.textContent;
 button.disabled=true;button.textContent="جارٍ الحفظ...";
 try{
  const {data,error}=await db.rpc("admin_set_store_status",{p_store_id:store.store_id,p_status:next});
  if(error)throw error;
  if(!data||data.store_status!==next)throw new Error("لم يؤكد الخادم الحالة الجديدة للمتجر.");
  alert("تم "+actionText+" المتجر بنجاح.");
  await load();
 }catch(error){
  alert("تعذر "+actionText+" المتجر: "+(error?.message||"حدث خطأ غير متوقع."));
  button.disabled=false;button.textContent=originalText;
 }
}
function renderLedger(){
 const body=$("#ledger-table");body.replaceChildren();const filter=$("#ledger-filter").value;
 rows.filter(o=>filter==="all"||o.commission_state===filter).forEach(o=>{const tr=document.createElement("tr");["#BB-"+o.order_number,o.store_names,new Date(o.created_at).toLocaleDateString("ar-IQ"),money(o.subtotal),money(o.delivery_fee),Number(o.commission_rate)>0?money(o.commission_amount)+" (5%)":"—",({due:"عمولة مستحقة",pending:"بانتظار الاكتمال",legacy_exempt:"طلب سابق مسلّم معفى",no_commission_snapshot:"لا توجد عمولة مسجلة",cancelled:"ملغي"})[o.commission_state]||o.status].forEach(v=>{const td=document.createElement("td");td.textContent=v||"—";tr.append(td)});body.append(tr)});
}
$("#coupon-form").addEventListener("submit",saveCoupon);$("#notification-form").addEventListener("submit",sendPlatformNotification);
$("#campaign-form").addEventListener("submit",saveCampaign);$("#campaign-cancel-edit").addEventListener("click",resetCampaignForm);
$("#refresh").addEventListener("click",load);$("#store-search").addEventListener("input",()=>renderStores(storeRows));$("#store-status-filter").addEventListener("change",()=>renderStores(storeRows));$("#ledger-filter").addEventListener("change",renderLedger);$("#logout").addEventListener("click",async()=>{await db.auth.signOut();location.href="index.html"});start();