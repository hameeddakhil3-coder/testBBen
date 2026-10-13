const db=window.bbenSupabase;
const $=s=>document.querySelector(s);
const money=v=>new Intl.NumberFormat("ar-IQ").format(Number(v)||0)+" د.ع";
let rows=[];
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
 if(a.error||b.error||c.error){$("#connection-status").textContent="تعذر تحميل البيانات";return}
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
 renderStores(b.data||[]);rows=c.data||[];renderLedger();$("#connection-status").textContent="البيانات محدثة";
}
function renderStores(data){
 const body=$("#stores-table");body.replaceChildren();
 if(!data.length){const tr=document.createElement("tr");const td=document.createElement("td");td.colSpan=7;td.textContent="لا توجد متاجر.";tr.append(td);body.append(tr);return}
 data.forEach(s=>{
  const tr=document.createElement("tr");
  [(s.store_name||"متجر")+" — "+(s.owner_name||"غير مسجل"),s.store_status==="active"?"نشط":s.store_status==="suspended"?"موقوف":"غير معروف",s.active_product_count+" / "+s.product_count,s.order_count,money(s.completed_sales),money(s.commission_due)].forEach((v,i)=>{
   const td=document.createElement("td");td.textContent=v;
   if(i===1){const badge=document.createElement("span");badge.className="status "+(s.store_status==="active"?"store-active":s.store_status==="suspended"?"store-suspended":"");badge.textContent=v;td.replaceChildren(badge)}
   tr.append(td);
  });
  const actionCell=document.createElement("td");
  const action=document.createElement("button");action.type="button";
  action.className="store-action "+(s.store_status==="active"?"danger":"primary");
  action.textContent=s.store_status==="active"?"إيقاف المتجر":s.store_status==="suspended"?"إعادة التفعيل":"حالة غير مدعومة";
  action.disabled=!["active","suspended"].includes(s.store_status);
  action.addEventListener("click",()=>changeStoreStatus(s,action));
  actionCell.append(action);tr.append(actionCell);body.append(tr);
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
 rows.filter(o=>filter==="all"||o.commission_state===filter).forEach(o=>{const tr=document.createElement("tr");["#BB-"+o.order_number,o.store_names,new Date(o.created_at).toLocaleDateString("ar-IQ"),money(o.subtotal),money(o.delivery_fee),Number(o.commission_rate)>0?money(o.commission_amount)+" (5%)":"—",({due:"عمولة مستحقة",pending:"بانتظار الاكتمال",legacy_exempt:"طلب سابق معفى",cancelled:"ملغي"})[o.commission_state]||o.status].forEach(v=>{const td=document.createElement("td");td.textContent=v||"—";tr.append(td)});body.append(tr)});
}
$("#refresh").addEventListener("click",load);$("#ledger-filter").addEventListener("change",renderLedger);$("#logout").addEventListener("click",async()=>{await db.auth.signOut();location.href="index.html"});start();