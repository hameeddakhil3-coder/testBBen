(() => {
  const PUBLIC_KEY = "BAxDUA6SBv7p2cdEpv3u3N6Qk7QYpJmPld7bdvlEW6EVaVyho5xxtX7MSWVkmEYiLiIbl22LIemrDF3l8dJ0NO4";
  const buttonId = "bben-enable-push";
  const decodeKey = (value) => {
    const padded = value + "=".repeat((4 - value.length % 4) % 4);
    return Uint8Array.from(atob(padded.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  };
  const encodeKey = (value) => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  async function enable(userId, role) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      alert("متصفحك لا يدعم إشعارات الدفع. جرّب Chrome أو أضف الموقع إلى الشاشة الرئيسية إذا كنت تستخدم iPhone.");
      return;
    }
    if (!userId || !["customer","merchant","admin"].includes(role)) {
      alert("سجّل الدخول أولاً ثم حاول تفعيل التنبيهات.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        alert("لم يتم السماح بالإشعارات. فعّلها من إعدادات الموقع في المتصفح.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/service-worker.js", {scope:"/"});
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(PUBLIC_KEY)});
      const json = subscription.toJSON();
      const {data:sessionData} = await window.bbenSupabase.auth.getSession();
      const session = sessionData?.session;
      if (!session || session.user.id !== userId) throw new Error("انتهت جلسة الدخول. سجّل الدخول مجدداً.");
      const {error} = await window.bbenSupabase.from("push_subscriptions").upsert({
        user_id:userId, role, endpoint:json.endpoint,
        p256dh:json.keys?.p256dh, auth_key:json.keys?.auth
      },{onConflict:"endpoint"});
      if (error) throw error;
      const btn = document.getElementById(buttonId);
      if (btn) { btn.textContent = "التنبيهات مفعّلة ✓"; btn.classList.add("push-enabled"); }
      alert("تم تفعيل تنبيهات BBen على هذا الجهاز. يمكنك اختبارها عند وصول إشعار جديد.");
    } catch (error) {
      console.error("BBen push setup failed",error);
      alert("تعذر تفعيل التنبيهات: " + (error?.message || "تحقق من اتصالك وإعدادات المتصفح."));
    }
  }
  function mount(userId, role) {
    const bell = document.getElementById(role === "merchant" ? "notification-button" : "notifications-button");
    if (!bell || document.getElementById(buttonId)) return;
    const button = document.createElement("button");
    button.id = buttonId;
    button.type = "button";
    button.className = "bben-push-enable";
    button.textContent = "تفعيل تنبيهات الجهاز";
    button.title = "السماح بإشعارات BBen خارج الموقع";
    button.addEventListener("click", () => enable(userId, role));
    bell.insertAdjacentElement("afterend", button);
  }
  window.BBenPush = { mount, enable };
})();