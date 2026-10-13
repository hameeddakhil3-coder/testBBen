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
 data.forEach(s=>{const tr=document.createElement("tr");[(s.store_name||"متجر")+" — "+(s.owner_name||"غير مسجل"),s.store_status,s.active_product_count+" / "+s.product_count,s.order_count,money(s.completed_sales),money(s.commission_due)].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.append(td)});body.append(tr)});
}
function renderLedger(){
 const body=$("#ledger-table");body.replaceChildren();const filter=$("#ledger-filter").value;
 rows.filter(o=>filter==="all"||o.commission_state===filter).forEach(o=>{const tr=document.createElement("tr");["#BB-"+o.order_number,o.store_names,new Date(o.created_at).toLocaleDateString("ar-IQ"),money(o.subtotal),money(o.delivery_fee),Number(o.commission_rate)>0?money(o.commission_amount)+" (5%)":"—",({due:"عمولة مستحقة",pending:"بانتظار الاكتمال",legacy_exempt:"طلب سابق معفى",cancelled:"ملغي"})[o.commission_state]||o.status].forEach(v=>{const td=document.createElement("td");td.textContent=v||"—";tr.append(td)});body.append(tr)});
}
$("#refresh").addEventListener("click",load);$("#ledger-filter").addEventListener("change",renderLedger);$("#logout").addEventListener("click",async()=>{await db.auth.signOut();location.href="index.html"});start();