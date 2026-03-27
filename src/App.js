import { useState, useEffect, useCallback, useRef } from "react";

// ═══════════════════════════════════════════════
// FIREBASE
// ═══════════════════════════════════════════════
const FB = "https://freakie-dogs-default-rtdb.firebaseio.com";
async function fbGet(p) { return (await fetch(`${FB}/${p}.json`)).json(); }
async function fbSet(p, d) { await fetch(`${FB}/${p}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }); }
async function fbUpdate(p, d) { await fetch(`${FB}/${p}.json`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }); }
async function fbPush(p, d) { return (await fetch(`${FB}/${p}.json`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) })).json(); }

// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════
const BRANCHES = [
  { id: "venecia", name: "Venecia" },
  { id: "lourdes", name: "Lourdes" },
  { id: "plaza_mundo", name: "Plaza Mundo Soyapango" },
  { id: "usulutan", name: "Usulután" },
  { id: "santa_tecla", name: "Santa Tecla" },
];

const STATUSES = [
  { id: "new", label: "Nuevo", color: "#f59e0b", icon: "🆕" },
  { id: "assigned", label: "Asignado", color: "#6366f1", icon: "📤" },
  { id: "preparing", label: "Preparando", color: "#3b82f6", icon: "👨‍🍳" },
  { id: "ready", label: "Listo", color: "#8b5cf6", icon: "✨" },
  { id: "on_the_way", label: "En camino", color: "#a855f7", icon: "🏍️" },
  { id: "delivered", label: "Entregado", color: "#10b981", icon: "✅" },
  { id: "cancelled", label: "Cancelado", color: "#ef4444", icon: "❌" },
];

function getStatus(id) { return STATUSES.find(s => s.id === id) || STATUSES[0]; }
function getBranch(id) { return BRANCHES.find(b => b.id === id) || { id: "", name: "—" }; }
function timeAgo(ts) {
  if (!ts) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "Ahora"; if (m < 60) return `${m}m`; if (m < 1440) return `${Math.floor(m / 60)}h`; return `${Math.floor(m / 1440)}d`;
}

// ═══════════════════════════════════════════════
// SEED USERS
// ═══════════════════════════════════════════════
async function seedUsers() {
  const existing = await fbGet("users");
  if (existing && Object.keys(existing).length > 6) return; // Already seeded with all roles

  const users = {
    // Admin
    admin1: { code: "ADMIN01", role: "admin", name: "Administrador General", branch: null, active: true },
    // Encargados (5)
    enc_ven: { code: "ENC-VEN", role: "encargado", name: "Encargado Venecia", branch: "venecia", active: true },
    enc_lou: { code: "ENC-LOU", role: "encargado", name: "Encargado Lourdes", branch: "lourdes", active: true },
    enc_plz: { code: "ENC-PLZ", role: "encargado", name: "Encargado Plaza Mundo", branch: "plaza_mundo", active: true },
    enc_usu: { code: "ENC-USU", role: "encargado", name: "Encargado Usulután", branch: "usulutan", active: true },
    enc_stc: { code: "ENC-STC", role: "encargado", name: "Encargado Santa Tecla", branch: "santa_tecla", active: true },
    // Asignadores - Lourdes (3)
    asg_lou1: { code: "ASG-LOU1", role: "asignador", name: "Asignador Lourdes 1", branch: "lourdes", active: true },
    asg_lou2: { code: "ASG-LOU2", role: "asignador", name: "Asignador Lourdes 2", branch: "lourdes", active: true },
    asg_lou3: { code: "ASG-LOU3", role: "asignador", name: "Asignador Lourdes 3", branch: "lourdes", active: true },
    // Asignadores - Santa Tecla (3)
    asg_stc1: { code: "ASG-STC1", role: "asignador", name: "Asignador Santa Tecla 1", branch: "santa_tecla", active: true },
    asg_stc2: { code: "ASG-STC2", role: "asignador", name: "Asignador Santa Tecla 2", branch: "santa_tecla", active: true },
    asg_stc3: { code: "ASG-STC3", role: "asignador", name: "Asignador Santa Tecla 3", branch: "santa_tecla", active: true },
    // Asignadores - Plaza Mundo (3)
    asg_plz1: { code: "ASG-PLZ1", role: "asignador", name: "Asignador Plaza Mundo 1", branch: "plaza_mundo", active: true },
    asg_plz2: { code: "ASG-PLZ2", role: "asignador", name: "Asignador Plaza Mundo 2", branch: "plaza_mundo", active: true },
    asg_plz3: { code: "ASG-PLZ3", role: "asignador", name: "Asignador Plaza Mundo 3", branch: "plaza_mundo", active: true },
    // Asignadores - Venecia (1)
    asg_ven1: { code: "ASG-VEN1", role: "asignador", name: "Asignador Venecia 1", branch: "venecia", active: true },
    // Asignadores - Usulután (1)
    asg_usu1: { code: "ASG-USU1", role: "asignador", name: "Asignador Usulután 1", branch: "usulutan", active: true },
    // Drivers - Lourdes (3)
    drv_lou1: { code: "DRV-LOU1", role: "driver", name: "Driver Lourdes 1", branch: "lourdes", active: true },
    drv_lou2: { code: "DRV-LOU2", role: "driver", name: "Driver Lourdes 2", branch: "lourdes", active: true },
    drv_lou3: { code: "DRV-LOU3", role: "driver", name: "Driver Lourdes 3", branch: "lourdes", active: true },
    // Drivers - Santa Tecla (5)
    drv_stc1: { code: "DRV-STC1", role: "driver", name: "Driver Santa Tecla 1", branch: "santa_tecla", active: true },
    drv_stc2: { code: "DRV-STC2", role: "driver", name: "Driver Santa Tecla 2", branch: "santa_tecla", active: true },
    drv_stc3: { code: "DRV-STC3", role: "driver", name: "Driver Santa Tecla 3", branch: "santa_tecla", active: true },
    drv_stc4: { code: "DRV-STC4", role: "driver", name: "Driver Santa Tecla 4", branch: "santa_tecla", active: true },
    drv_stc5: { code: "DRV-STC5", role: "driver", name: "Driver Santa Tecla 5", branch: "santa_tecla", active: true },
    // Drivers - Plaza Mundo (3)
    drv_plz1: { code: "DRV-PLZ1", role: "driver", name: "Driver Plaza Mundo 1", branch: "plaza_mundo", active: true },
    drv_plz2: { code: "DRV-PLZ2", role: "driver", name: "Driver Plaza Mundo 2", branch: "plaza_mundo", active: true },
    drv_plz3: { code: "DRV-PLZ3", role: "driver", name: "Driver Plaza Mundo 3", branch: "plaza_mundo", active: true },
    // Drivers - Venecia (1)
    drv_ven1: { code: "DRV-VEN1", role: "driver", name: "Driver Venecia 1", branch: "venecia", active: true },
    // Drivers - Usulután (1)
    drv_usu1: { code: "DRV-USU1", role: "driver", name: "Driver Usulután 1", branch: "usulutan", active: true },
  };
  await fbSet("users", users);
}

// ═══════════════════════════════════════════════
// APP ROUTER
// ═══════════════════════════════════════════════
export default function App() {
  const path = window.location.pathname;
  if (path.startsWith("/track/")) return <TrackingView orderId={path.split("/track/")[1]} />;
  return <MainApp />;
}

// ═══════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════
function MainApp() {
  const [user, setUser] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { seedUsers().then(() => setLoading(false)); }, []);

  const login = async () => {
    setError("");
    const users = await fbGet("users");
    if (!users) { setError("Error de conexión"); return; }
    const f = Object.entries(users).find(([, u]) => u.code === code.toUpperCase() && u.active);
    if (!f) { setError("Código no válido"); return; }
    setUser({ id: f[0], ...f[1] });
  };

  if (loading) return <div style={S.center}><p style={{ color: "#888" }}>Cargando...</p></div>;

  if (!user) {
    return (
      <div style={S.loginWrap}>
        <div style={S.loginCard}>
          <div style={{ fontSize: 48, textAlign: "center", marginBottom: 8 }}>🌭</div>
          <h1 style={S.loginTitle}>Freakie Dogs</h1>
          <p style={S.loginSub}>Sistema de Gestión</p>
          <input style={S.codeInput} type="text" placeholder="Tu código de acceso" value={code}
            onChange={e => setCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && login()} maxLength={10} />
          {error && <p style={S.error}>{error}</p>}
          <button style={S.btnPrimary} onClick={login}>Ingresar</button>
        </div>
      </div>
    );
  }

  const logout = () => { setUser(null); setCode(""); };
  if (user.role === "admin") return <AdminDash user={user} onLogout={logout} />;
  if (user.role === "encargado") return <EncargadoDash user={user} onLogout={logout} />;
  if (user.role === "asignador") return <AsignadorDash user={user} onLogout={logout} />;
  if (user.role === "driver") return <DriverDash user={user} onLogout={logout} />;
  return <div style={S.center}><p>Rol desconocido</p></div>;
}

// ═══════════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════════
function AdminDash({ user, onLogout }) {
  const [orders, setOrders] = useState({});
  const [users, setUsers] = useState({});
  const [view, setView] = useState("list");
  const [sel, setSel] = useState(null);
  const [filter, setFilter] = useState("new");
  const poll = useRef(null);

  const load = useCallback(async () => {
    const [o, u] = await Promise.all([fbGet("orders"), fbGet("users")]);
    setOrders(o || {}); setUsers(u || {});
  }, []);
  useEffect(() => { load(); poll.current = setInterval(load, 2000); return () => clearInterval(poll.current); }, [load]);

  const assignBranch = async (oid, bid) => {
    setOrders(prev => ({ ...prev, [oid]: { ...prev[oid], branch: bid, status: "assigned" } }));
    setView("list"); setSel(null);
    await fbUpdate(`orders/${oid}`, { branch: bid, status: "assigned", assignedAt: Date.now(), assignedBy: user.name });
    load();
  };

  const createTest = async () => {
    const names = ["María López", "Carlos Rivas", "Ana Martínez", "José Hernández", "Laura García"];
    const sets = [[{ name: "Freakie Burger", qty: 2, price: 7.99 }, { name: "Combo Individual", qty: 1, price: 3.99 }], [{ name: "Burger Box", qty: 1, price: 19.50 }], [{ name: "Combo Trío", qty: 1, price: 11.99 }], [{ name: "Combpleto", qty: 1, price: 31.99 }]];
    const its = sets[Math.floor(Math.random() * sets.length)];
    await fbPush("orders", {
      orderId: "FD-" + Math.random().toString().substring(2, 10),
      customer: { name: names[Math.floor(Math.random() * names.length)], phone: "7" + Math.random().toString().substring(2, 9) },
      items: its, total: Math.round(its.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100,
      delivery: { type: "delivery", address: "Calle #" + Math.floor(Math.random() * 100), houseNum: "Casa " + Math.floor(Math.random() * 50), city: "San Salvador", reference: "Cerca del parque", coords: { lat: 13.6783 + (Math.random() - 0.5) * 0.05, lng: -89.2808 + (Math.random() - 0.5) * 0.05 } },
      payment: ["cash", "transfer", "card"][Math.floor(Math.random() * 3)],
      status: "new", branch: null, driverId: null, driverName: null, statusUpdates: { new: Date.now() }, createdAt: Date.now(), note: "",
    });
    load();
  };

  const all = Object.entries(orders).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
  const flt = filter === "all" ? all : filter === "active" ? all.filter(([, o]) => !["delivered", "cancelled"].includes(o.status)) : all.filter(([, o]) => o.status === filter);
  const cnt = { new: all.filter(([, o]) => o.status === "new").length, active: all.filter(([, o]) => !["delivered", "cancelled", "new"].includes(o.status)).length, delivered: all.filter(([, o]) => o.status === "delivered").length };

  if (view === "detail" && sel) {
    const [oid, o] = sel; const st = getStatus(o.status);
    return (
      <div style={S.container}>
        <div style={S.topBar}><button style={S.backBtn} onClick={() => { setView("list"); setSel(null); }}>← Volver</button><h2 style={S.topTitle}>{o.orderId}</h2></div>
        <div style={S.card}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ ...S.badge, background: st.color }}>{st.icon} {st.label}</span>
            {o.branch && <span style={{ ...S.badge, background: "#334155" }}>📍 {getBranch(o.branch).name}</span>}
            {o.driverName && <span style={{ ...S.badge, background: "#10b981" }}>🏍️ {o.driverName}</span>}
          </div>
          {o.status === "new" && (<div style={{ marginBottom: 20 }}><h3 style={S.secTitle}>📤 Asignar a sucursal</h3>{BRANCHES.map(b => (<button key={b.id} style={S.branchBtn} onClick={() => assignBranch(oid, b.id)}>📍 {b.name}</button>))}</div>)}
          <OrderDetails order={o} />
          {!["delivered", "cancelled"].includes(o.status) && (<button style={S.btnDanger} onClick={async () => { if (window.confirm("¿Cancelar?")) { await fbUpdate(`orders/${oid}`, { status: "cancelled" }); setView("list"); load(); } }}>❌ Cancelar pedido</button>)}
        </div>
      </div>
    );
  }

  if (view === "users") {
    return (
      <div style={S.container}>
        <div style={S.topBar}><button style={S.backBtn} onClick={() => setView("list")}>← Volver</button><h2 style={S.topTitle}>Usuarios</h2></div>
        {["admin", "encargado", "asignador", "driver"].map(role => {
          const roleUsers = Object.entries(users).filter(([, u]) => u.role === role);
          if (roleUsers.length === 0) return null;
          return (
            <div key={role}>
              <h3 style={{ color: "#888", fontSize: 13, margin: "16px 0 8px", textTransform: "uppercase" }}>{role === "admin" ? "👑 Admin" : role === "encargado" ? "🏪 Encargados" : role === "asignador" ? "📋 Asignadores" : "🏍️ Drivers"}</h3>
              {roleUsers.map(([id, u]) => (
                <div key={id} style={{ ...S.card, padding: 12, marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, color: "#fff", fontSize: 14 }}>{u.name}</span>
                    <span style={{ fontFamily: "monospace", color: "#f59e0b", fontSize: 13 }}>{u.code}</span>
                  </div>
                  {u.branch && <div style={{ fontSize: 12, color: "#888" }}>📍 {getBranch(u.branch).name}</div>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={S.container}>
      <div style={S.topBar}>
        <div><h1 style={S.logo}>🌭 Freakie Dogs</h1><p style={{ fontSize: 12, color: "#f97316", margin: 0 }}>Administrador</p></div>
        <div style={{ display: "flex", gap: 6 }}><button style={S.btnSmall} onClick={() => setView("users")}>👥</button><button style={{ ...S.btnSmall, color: "#ef4444" }} onClick={onLogout}>Salir</button></div>
      </div>
      <div style={S.statsRow}>
        {[{ l: "Nuevos", c: cnt.new, cl: "#f59e0b", f: "new" }, { l: "Activos", c: cnt.active, cl: "#3b82f6", f: "active" }, { l: "Entregados", c: cnt.delivered, cl: "#10b981", f: "delivered" }, { l: "Todos", c: all.length, cl: "#888", f: "all" }].map(s => (
          <button key={s.f} onClick={() => setFilter(s.f)} style={{ ...S.statCard, borderColor: filter === s.f ? s.cl : "#333", background: filter === s.f ? s.cl + "15" : "#111" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.cl }}>{s.c}</div><div style={{ fontSize: 10, color: "#999" }}>{s.l}</div>
          </button>))}
      </div>
      <button style={{ ...S.btnSec, width: "100%", marginBottom: 12 }} onClick={createTest}>🧪 Crear pedido de prueba</button>
      <OrderList orders={flt} onSelect={o => { setSel(o); setView("detail"); }} />
      <div style={S.footer}>Actualizando cada 2s · Freakie Dogs © 2026</div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// ENCARGADO DASHBOARD
// ═══════════════════════════════════════════════
function EncargadoDash({ user, onLogout }) {
  const [orders, setOrders] = useState({});
  const [view, setView] = useState("list");
  const [sel, setSel] = useState(null);
  const [filter, setFilter] = useState("assigned");
  const poll = useRef(null);

  const load = useCallback(async () => { setOrders((await fbGet("orders")) || {}); }, []);
  useEffect(() => { load(); poll.current = setInterval(load, 2000); return () => clearInterval(poll.current); }, [load]);

  const my = Object.entries(orders).filter(([, o]) => o.branch === user.branch).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
  const flt = filter === "all" ? my : my.filter(([, o]) => o.status === filter);
  const cnt = { assigned: my.filter(([, o]) => o.status === "assigned").length, preparing: my.filter(([, o]) => o.status === "preparing").length, ready: my.filter(([, o]) => o.status === "ready").length };

  const setStatus = async (oid, s, extra = {}) => {
    setOrders(prev => ({ ...prev, [oid]: { ...prev[oid], status: s, ...extra } }));
    await fbUpdate(`orders/${oid}`, { status: s, [`statusUpdates/${s}`]: Date.now(), ...extra });
    load();
  };

  const [prepTime, setPrepTime] = useState(null);

  if (view === "detail" && sel) {
    const [oid, o] = sel; const st = getStatus(o.status);
    return (
      <div style={S.container}>
        <div style={S.topBar}><button style={S.backBtn} onClick={() => { setView("list"); setSel(null); setPrepTime(null); }}>← Volver</button><h2 style={S.topTitle}>{o.orderId}</h2></div>
        <div style={S.card}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}><span style={{ ...S.badge, background: st.color }}>{st.icon} {st.label}</span>
            {o.prepMinutes && <span style={{ ...S.badge, background: "#334155" }}>⏱️ {o.prepMinutes} min</span>}
          </div>
          <OrderDetails order={o} />

          {/* Assigned: select prep time then accept */}
          {o.status === "assigned" && (
            <div style={{ marginTop: 12 }}>
              <h3 style={S.secTitle}>⏱️ Tiempo de preparación</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 12 }}>
                {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map(m => (
                  <button key={m} onClick={() => setPrepTime(m)} style={{
                    padding: "12px 0", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer",
                    background: prepTime === m ? "#f97316" : "#1a1a1a",
                    color: prepTime === m ? "#fff" : "#888",
                    border: prepTime === m ? "2px solid #f97316" : "1px solid #333",
                  }}>{m}m</button>
                ))}
              </div>
              <button
                style={{ ...S.btnAction, opacity: prepTime ? 1 : 0.4, pointerEvents: prepTime ? "auto" : "none" }}
                onClick={() => {
                  const extra = { prepMinutes: prepTime, prepStartedAt: Date.now() };
                  setStatus(oid, "preparing", extra);
                  setSel([oid, { ...o, status: "preparing", ...extra }]);
                  setPrepTime(null);
                }}
              >👨‍🍳 Aceptar pedido ({prepTime ? `${prepTime} min` : "seleccioná tiempo"})</button>
            </div>
          )}

          {o.status === "preparing" && <button style={{ ...S.btnAction, background: "#1a0a2e", color: "#a78bfa", borderColor: "#7c3aed" }} onClick={() => { setStatus(oid, "ready"); setSel([oid, { ...o, status: "ready" }]); }}>✨ Listo para entrega</button>}
        </div>
      </div>
    );
  }

  return (
    <div style={S.container}>
      <div style={S.topBar}><div><h1 style={S.logo}>🌭 {getBranch(user.branch).name}</h1><p style={{ fontSize: 12, color: "#3b82f6", margin: 0 }}>Encargado</p></div><button style={{ ...S.btnSmall, color: "#ef4444" }} onClick={onLogout}>Salir</button></div>
      <div style={S.statsRow}>
        {[{ l: "Nuevos", c: cnt.assigned, cl: "#6366f1", f: "assigned" }, { l: "Preparando", c: cnt.preparing, cl: "#3b82f6", f: "preparing" }, { l: "Listos", c: cnt.ready, cl: "#8b5cf6", f: "ready" }].map(s => (
          <button key={s.f} onClick={() => setFilter(s.f)} style={{ ...S.statCard, borderColor: filter === s.f ? s.cl : "#333", background: filter === s.f ? s.cl + "15" : "#111" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.cl }}>{s.c}</div><div style={{ fontSize: 10, color: "#999" }}>{s.l}</div>
          </button>))}
      </div>
      {flt.length === 0 ? <div style={S.empty}><p style={{ fontSize: 36 }}>📭</p><p>No hay pedidos</p></div> :
        flt.map(([id, o]) => {
          const st = getStatus(o.status);
          return (
            <div key={id} style={S.orderCard} onClick={() => { setSel([id, o]); setView("detail"); }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontWeight: 800, fontFamily: "monospace", color: "#fff", fontSize: 14 }}>{o.orderId}</span><span style={{ ...S.badge, background: st.color }}>{st.icon} {st.label}</span></div>
              <div style={{ fontSize: 13, color: "#ccc", marginBottom: 3 }}>👤 {o.customer?.name}</div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{(o.items || []).map(i => `${i.qty}x ${i.name}`).join(", ")}</div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontWeight: 700, color: "#f97316" }}>${o.total?.toFixed(2)}</span><span style={{ fontSize: 11, color: "#555" }}>{timeAgo(o.createdAt)}</span></div>
              {o.status === "assigned" && <button style={{ ...S.btnQuick, marginTop: 8 }} onClick={e => { e.stopPropagation(); setSel([id, o]); setView("detail"); }}>👨‍🍳 Aceptar pedido</button>}
              {o.status === "preparing" && <button style={{ ...S.btnQuick, marginTop: 8, background: "#1a0a2e", color: "#a78bfa", borderColor: "#7c3aed" }} onClick={e => { e.stopPropagation(); setStatus(id, "ready"); }}>✨ Listo</button>}
            </div>);
        })}
      <div style={S.footer}>{getBranch(user.branch).name}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// ASIGNADOR DASHBOARD
// ═══════════════════════════════════════════════
function AsignadorDash({ user, onLogout }) {
  const [orders, setOrders] = useState({});
  const [users, setUsers] = useState({});
  const [view, setView] = useState("list");
  const [sel, setSel] = useState(null);
  const poll = useRef(null);

  const load = useCallback(async () => {
    const [o, u] = await Promise.all([fbGet("orders"), fbGet("users")]);
    setOrders(o || {}); setUsers(u || {});
  }, []);
  useEffect(() => { load(); poll.current = setInterval(load, 2000); return () => clearInterval(poll.current); }, [load]);

  // Drivers of my branch only
  const myDrivers = Object.entries(users).filter(([, u]) => u.role === "driver" && u.branch === user.branch);

  // Orders: all active orders for my branch (from assigned onwards)
  const myOrders = Object.entries(orders)
    .filter(([, o]) => o.branch === user.branch && ["assigned", "preparing", "ready", "on_the_way"].includes(o.status))
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  const assignedCount = myOrders.filter(([, o]) => o.status === "assigned").length;
  const preparingCount = myOrders.filter(([, o]) => o.status === "preparing").length;
  const readyCount = myOrders.filter(([, o]) => o.status === "ready").length;
  const onWayCount = myOrders.filter(([, o]) => o.status === "on_the_way").length;

  const assignDriver = async (oid, driverId) => {
    const driver = users[driverId];
    await fbUpdate(`orders/${oid}`, { driverId: driverId || null, driverName: driver?.name || "", driverUserId: driverId || null });
    // Update selected order locally so UI reflects immediately
    if (sel && sel[0] === oid) {
      setSel([oid, { ...sel[1], driverId: driverId || null, driverName: driver?.name || "", driverUserId: driverId || null }]);
    }
    load();
  };

  if (view === "detail" && sel) {
    const [oid, o] = sel; const st = getStatus(o.status);
    return (
      <div style={S.container}>
        <div style={S.topBar}><button style={S.backBtn} onClick={() => { setView("list"); setSel(null); }}>← Volver</button><h2 style={S.topTitle}>{o.orderId}</h2></div>
        <div style={S.card}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ ...S.badge, background: st.color }}>{st.icon} {st.label}</span>
            {o.driverName && <span style={{ ...S.badge, background: "#10b981" }}>🏍️ {o.driverName}</span>}
          </div>

          {/* Assign driver */}
          <div style={{ marginBottom: 16 }}>
            <h3 style={S.secTitle}>🏍️ Asignar motorista</h3>
            <select style={S.select} value={o.driverId || ""} onChange={e => assignDriver(oid, e.target.value)}>
              <option value="">— Sin asignar —</option>
              {myDrivers.map(([id, d]) => (<option key={id} value={id}>{d.name} ({d.code})</option>))}
            </select>
          </div>

          <OrderDetails order={o} />

          {/* Tracking link */}
          {o.driverId && o.status === "on_the_way" && (
            <div style={{ marginTop: 12, padding: 12, background: "#1a1a2e", borderRadius: 8, textAlign: "center" }}>
              <p style={{ fontSize: 12, color: "#888", margin: "0 0 4px" }}>Link de rastreo:</p>
              <p style={{ fontSize: 13, color: "#60a5fa", wordBreak: "break-all", margin: 0 }}>{window.location.origin}/track/{oid}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={S.container}>
      <div style={S.topBar}><div><h1 style={S.logo}>📋 {getBranch(user.branch).name}</h1><p style={{ fontSize: 12, color: "#8b5cf6", margin: 0 }}>Asignador de Motoristas</p></div><button style={{ ...S.btnSmall, color: "#ef4444" }} onClick={onLogout}>Salir</button></div>
      <div style={S.statsRow}>
        <div style={{ ...S.statCard, borderColor: "#6366f1", flex: 1 }}><div style={{ fontSize: 22, fontWeight: 800, color: "#6366f1" }}>{assignedCount}</div><div style={{ fontSize: 10, color: "#999" }}>Asignados</div></div>
        <div style={{ ...S.statCard, borderColor: "#3b82f6", flex: 1 }}><div style={{ fontSize: 22, fontWeight: 800, color: "#3b82f6" }}>{preparingCount}</div><div style={{ fontSize: 10, color: "#999" }}>Preparando</div></div>
        <div style={{ ...S.statCard, borderColor: "#8b5cf6", flex: 1 }}><div style={{ fontSize: 22, fontWeight: 800, color: "#8b5cf6" }}>{readyCount}</div><div style={{ fontSize: 10, color: "#999" }}>Listos</div></div>
        <div style={{ ...S.statCard, borderColor: "#a855f7", flex: 1 }}><div style={{ fontSize: 22, fontWeight: 800, color: "#a855f7" }}>{onWayCount}</div><div style={{ fontSize: 10, color: "#999" }}>En camino</div></div>
      </div>
      {myOrders.length === 0 ? <div style={S.empty}><p style={{ fontSize: 36 }}>📭</p><p>No hay pedidos</p></div> :
        myOrders.map(([id, o]) => {
          const st = getStatus(o.status);
          return (
            <div key={id} style={S.orderCard} onClick={() => { setSel([id, o]); setView("detail"); }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontWeight: 800, fontFamily: "monospace", color: "#fff", fontSize: 14 }}>{o.orderId}</span><span style={{ ...S.badge, background: st.color }}>{st.icon} {st.label}</span></div>
              <div style={{ fontSize: 13, color: "#ccc", marginBottom: 3 }}>👤 {o.customer?.name} · 📍 {o.delivery?.address}</div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, color: "#f97316" }}>${o.total?.toFixed(2)}</span>
                <span style={{ fontSize: 12, color: o.driverName ? "#10b981" : "#ef4444" }}>{o.driverName ? `🏍️ ${o.driverName}` : "⚠️ Sin driver"}</span>
              </div>
            </div>);
        })}
      <div style={S.footer}>{getBranch(user.branch).name} · Asignador</div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// DRIVER DASHBOARD
// ═══════════════════════════════════════════════
function DriverDash({ user, onLogout }) {
  const [orders, setOrders] = useState({});
  const [activeDelivery, setActiveDelivery] = useState(null);
  const gpsRef = useRef(null);
  const poll = useRef(null);

  const load = useCallback(async () => { setOrders((await fbGet("orders")) || {}); }, []);
  useEffect(() => { load(); poll.current = setInterval(load, 2000); return () => clearInterval(poll.current); }, [load]);
  useEffect(() => { return () => { if (gpsRef.current) navigator.geolocation.clearWatch(gpsRef.current); }; }, []);

  const myOrders = Object.entries(orders)
    .filter(([, o]) => o.driverUserId === user.id && !["delivered", "cancelled"].includes(o.status))
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  const delivered = Object.entries(orders)
    .filter(([, o]) => o.driverUserId === user.id && o.status === "delivered")
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0)).slice(0, 5);

  const startDelivery = async (oid) => {
    setOrders(prev => ({ ...prev, [oid]: { ...prev[oid], status: "on_the_way" } }));
    setActiveDelivery(oid);
    if (navigator.geolocation) {
      gpsRef.current = navigator.geolocation.watchPosition(
        p => { const loc = { lat: p.coords.latitude, lng: p.coords.longitude, timestamp: Date.now(), accuracy: p.coords.accuracy }; fbSet(`tracking/${oid}`, loc); },
        err => console.error("GPS:", err), { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
      );
    }
    await fbUpdate(`orders/${oid}`, { status: "on_the_way", [`statusUpdates/on_the_way`]: Date.now() });
    load();
  };

  const completeDelivery = async (oid) => {
    if (gpsRef.current) { navigator.geolocation.clearWatch(gpsRef.current); gpsRef.current = null; }
    setOrders(prev => ({ ...prev, [oid]: { ...prev[oid], status: "delivered" } }));
    setActiveDelivery(null);
    await fbUpdate(`orders/${oid}`, { status: "delivered", [`statusUpdates/delivered`]: Date.now() });
    await fbSet(`tracking/${oid}`, null);
    load();
  };

  return (
    <div style={S.container}>
      <div style={S.topBar}><div><h1 style={S.logo}>🏍️ {user.name}</h1><p style={{ fontSize: 12, color: "#10b981", margin: 0 }}>{getBranch(user.branch).name}</p></div><button style={{ ...S.btnSmall, color: "#ef4444" }} onClick={() => { if (gpsRef.current) navigator.geolocation.clearWatch(gpsRef.current); onLogout(); }}>Salir</button></div>

      {activeDelivery && (
        <div style={{ background: "#1a0a2e", border: "2px solid #8b5cf6", borderRadius: 12, padding: 14, marginBottom: 14, textAlign: "center" }}>
          <p style={{ color: "#a78bfa", fontSize: 14, margin: 0 }}>📡 Compartiendo ubicación en tiempo real</p>
        </div>
      )}

      <h2 style={{ fontSize: 14, color: "#999", margin: "0 0 10px" }}>📋 Mis pedidos ({myOrders.length})</h2>

      {myOrders.length === 0 ? <div style={S.empty}><p style={{ fontSize: 36 }}>⏳</p><p>No tenés pedidos asignados</p></div> :
        myOrders.map(([id, o]) => {
          const st = getStatus(o.status);
          const isActive = activeDelivery === id;
          return (
            <div key={id} style={{ ...S.orderCard, borderColor: isActive ? "#8b5cf6" : "#222", borderWidth: isActive ? 2 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontWeight: 800, fontFamily: "monospace", color: "#fff" }}>{o.orderId}</span><span style={{ ...S.badge, background: st.color }}>{st.icon} {st.label}</span></div>
              <div style={{ fontSize: 14, color: "#ccc", marginBottom: 4 }}>👤 {o.customer?.name} · 📱 {o.customer?.phone}</div>
              {o.delivery?.type === "delivery" && (
                <div style={{ background: "#1a1a1a", borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 13 }}>
                  <p style={{ color: "#ccc", margin: "2px 0" }}>📍 {o.delivery.address}</p>
                  <p style={{ color: "#ccc", margin: "2px 0" }}>🏠 {o.delivery.houseNum} · 📌 {o.delivery.reference}</p>
                  {o.delivery.coords && (
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${o.delivery.coords.lat},${o.delivery.coords.lng}&travelmode=driving`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ display: "inline-block", marginTop: 6, padding: "6px 12px", background: "#1a3a1a", borderRadius: 6, color: "#4ade80", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
                      🗺️ Navegar con Google Maps
                    </a>
                  )}
                </div>
              )}
              <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>{(o.items || []).map(i => `${i.qty}x ${i.name}`).join(", ")}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontWeight: 700, color: "#f97316" }}>${o.total?.toFixed(2)}</span>
                <span style={{ fontSize: 12, color: "#888" }}>{o.payment === "cash" ? "💵 Efectivo" : o.payment === "transfer" ? "🏦 Transferencia" : "💳 Tarjeta"}</span>
              </div>
              {o.status === "ready" && (
                <button style={{ width: "100%", padding: "12px", background: "#1a1a4a", color: "#818cf8", border: "2px solid #4f46e5", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer" }} onClick={() => startDelivery(id)}>🏍️ Iniciar entrega</button>
              )}
              {(o.status === "assigned" || o.status === "preparing") && (
                <div style={{ width: "100%", padding: "12px", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, fontSize: 14, color: "#666", textAlign: "center" }}>⏳ Esperando preparación...</div>
              )}
              {o.status === "on_the_way" && (
                <div style={{ display: "flex", gap: 8 }}>
                  {!isActive && <button style={{ flex: 1, padding: "12px", background: "#1a1a4a", color: "#818cf8", border: "2px solid #4f46e5", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }} onClick={() => startDelivery(id)}>📡 Reanudar GPS</button>}
                  <button style={{ flex: 1, padding: "12px", background: "#0a2a0a", color: "#4ade80", border: "2px solid #16a34a", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }} onClick={() => completeDelivery(id)}>✅ Entregado</button>
                </div>
              )}
            </div>);
        })}

      {delivered.length > 0 && (<><h2 style={{ fontSize: 14, color: "#999", margin: "20px 0 10px" }}>✅ Recientes</h2>{delivered.map(([id, o]) => (
        <div key={id} style={{ ...S.orderCard, opacity: 0.5 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontFamily: "monospace", color: "#fff" }}>{o.orderId}</span><span style={{ color: "#10b981", fontSize: 12 }}>✅</span></div><div style={{ fontSize: 12, color: "#888" }}>{o.customer?.name} — ${o.total?.toFixed(2)}</div></div>
      ))}</>)}
      <div style={S.footer}>Driver · {getBranch(user.branch).name}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TRACKING VIEW (Client)
// ═══════════════════════════════════════════════
function TrackingView({ orderId }) {
  const [order, setOrder] = useState(null);
  const [loc, setLoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const leafletOk = useRef(false);
  const poll = useRef(null);

  const load = useCallback(async () => {
    const [o, t] = await Promise.all([fbGet(`orders/${orderId}`), fbGet(`tracking/${orderId}`)]);
    if (o) setOrder(o); if (t) setLoc(t); setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); poll.current = setInterval(load, 2000); return () => clearInterval(poll.current); }, [load]);

  useEffect(() => {
    if (!loc || leafletOk.current) return;
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
    const js = document.createElement("script"); js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    js.onload = () => { leafletOk.current = true; initMap(); };
    document.head.appendChild(js);
  }, [loc]);

  useEffect(() => { if (leafletOk.current && markerRef.current && loc) { markerRef.current.setLatLng([loc.lat, loc.lng]); mapRef.current?.panTo([loc.lat, loc.lng]); } }, [loc]);

  const initMap = () => {
    if (!window.L || !document.getElementById("tmap") || !loc) return;
    const map = window.L.map("tmap", { zoomControl: false }).setView([loc.lat, loc.lng], 16);
    window.L.control.zoom({ position: "bottomright" }).addTo(map);
    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { attribution: "© CARTO" }).addTo(map);
    const driverSvg = `<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:#f97316;border-radius:50%;box-shadow:0 3px 12px rgba(249,115,22,0.5)"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><path d="M12 2l-4 9h8l-1 4"/><path d="M16 11l3 7"/><path d="M8 11L5 18"/></svg></div>`;
    const icon = window.L.divIcon({ html: driverSvg, iconSize: [40, 40], iconAnchor: [20, 20], className: "" });
    markerRef.current = window.L.marker([loc.lat, loc.lng], { icon }).addTo(map);
    if (order?.delivery?.coords) {
      const destSvg = `<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:#10b981;border-radius:50%;box-shadow:0 3px 12px rgba(16,185,129,0.5)"><svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5z"/></svg></div>`;
      const di = window.L.divIcon({ html: destSvg, iconSize: [36, 36], iconAnchor: [18, 18], className: "" });
      window.L.marker([order.delivery.coords.lat, order.delivery.coords.lng], { icon: di }).addTo(map);
    }
    mapRef.current = map; setTimeout(() => map.invalidateSize(), 200);
  };

  if (loading) return <div style={S.center}><p style={{ color: "#888" }}>Cargando...</p></div>;
  if (!order) return <div style={S.center}><p style={{ fontSize: 48 }}>❌</p><p style={{ color: "#888" }}>Pedido no encontrado</p></div>;

  const st = getStatus(order.status);
  const steps = ["received", "preparing", "on_the_way", "delivered"];
  const cur = Math.max(0, steps.indexOf(order.status === "assigned" ? "received" : order.status === "ready" ? "preparing" : order.status));

  return (
    <div style={{ ...S.container, maxWidth: 500 }}>
      <div style={{ textAlign: "center", padding: "20px 0 10px" }}><div style={{ fontSize: 32 }}>🌭</div><h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: "4px 0" }}>Freakie Dogs</h1><p style={{ fontSize: 13, color: "#888", margin: 0 }}>Seguimiento de pedido</p></div>
      <div style={{ textAlign: "center", marginBottom: 16 }}><span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 800, color: "#f97316" }}>{order.orderId}</span></div>
      <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 20, padding: "0 16px" }}>
        {steps.map((step, i) => { const s = getStatus(step); const a = i <= cur; const c = i === cur; return (
          <div key={step} style={{ flex: 1, textAlign: "center" }}><div style={{ height: 6, borderRadius: 3, background: a ? s.color : "#333", marginBottom: 6 }} /><div style={{ fontSize: 18, opacity: a ? 1 : 0.3 }}>{s.icon}</div><div style={{ fontSize: 10, color: c ? s.color : "#666", fontWeight: c ? 700 : 400 }}>{s.label}</div></div>
        ); })}
      </div>
      <div style={{ textAlign: "center", marginBottom: 20 }}><span style={{ ...S.badge, background: st.color, fontSize: 14, padding: "6px 16px" }}>{st.icon} {st.label}</span></div>
      {(order.status === "preparing" || order.status === "assigned") && order.prepStartedAt && order.prepMinutes && (
        <CountdownTimer prepStartedAt={order.prepStartedAt} prepMinutes={order.prepMinutes} />
      )}
      {(order.status === "preparing" || order.status === "assigned") && !order.prepStartedAt && (
        <div style={{ textAlign: "center", padding: 20, background: "#111", borderRadius: 12, marginBottom: 16 }}>
          <p style={{ fontSize: 30 }}>👨‍🍳</p>
          <p style={{ color: "#888", fontSize: 14 }}>Tu pedido está siendo procesado</p>
        </div>
      )}
      {order.status === "ready" && (
        <div style={{ textAlign: "center", padding: 20, background: "#0a0a2e", borderRadius: 12, marginBottom: 16, border: "1px solid #2a2a4e" }}>
          <p style={{ fontSize: 36 }}>✨</p>
          <p style={{ color: "#a78bfa", fontSize: 16, fontWeight: 700 }}>¡Tu pedido está listo!</p>
          <p style={{ color: "#888", fontSize: 13 }}>Esperando motorista para la entrega</p>
        </div>
      )}
      {order.status === "on_the_way" && loc && (<><div id="tmap" style={{ width: "100%", height: 300, borderRadius: 12, border: "1px solid #333", marginBottom: 8 }} /><p style={{ textAlign: "center", fontSize: 12, color: "#666" }}>🏍️ Tu motorista viene en camino</p></>)}
      {order.status === "on_the_way" && !loc && <div style={{ textAlign: "center", padding: 20, background: "#111", borderRadius: 12, marginBottom: 16 }}><p style={{ fontSize: 30 }}>🏍️</p><p style={{ color: "#888", fontSize: 14 }}>Esperando GPS del motorista...</p></div>}
      {order.status === "delivered" && <div style={{ textAlign: "center", padding: 20, background: "#0a1a0a", borderRadius: 12, marginBottom: 16, border: "1px solid #1a3a1a" }}><p style={{ fontSize: 40 }}>🎉</p><p style={{ color: "#4ade80", fontSize: 16, fontWeight: 700 }}>¡Pedido entregado!</p></div>}

      {/* Mini game while waiting */}
      {!["delivered", "cancelled"].includes(order.status) && (
        <FreakieRunner />
      )}

      <div style={{ ...S.card }}><h3 style={S.secTitle}>📋 Tu pedido</h3>{(order.items || []).map((it, i) => <div key={i} style={S.row}><span>{it.qty}x {it.name}</span><span style={{ fontWeight: 700 }}>${(it.price * it.qty).toFixed(2)}</span></div>)}<div style={{ ...S.row, borderTop: "1px solid #333", marginTop: 8, paddingTop: 8 }}><span style={{ fontWeight: 800 }}>Total</span><span style={{ fontWeight: 800, color: "#f97316" }}>${order.total?.toFixed(2)}</span></div></div>
      {order.driverName && <div style={S.card}><h3 style={S.secTitle}>🏍️ Tu motorista</h3><p style={{ color: "#fff", fontSize: 15, margin: "2px 0", fontWeight: 600 }}>{order.driverName}</p></div>}
      <div style={S.footer}>Freakie Dogs © 2026 🌭🔥</div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// FREAKIE RUNNER — Mini game while waiting
// ═══════════════════════════════════════════════
function FreakieRunner() {
  const canvasRef = useRef(null);
  const gameRef = useRef({ running: false, score: 0, highScore: 0, speed: 3, dog: { y: 0, vy: 0, grounded: true }, obstacles: [], frame: 0 });
  const rafRef = useRef(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);

  const W = 340, H = 160;
  const GROUND = H - 30;
  const DOG_W = 28, DOG_H = 22;
  const GRAVITY = 0.6;
  const JUMP = -10;
  const obstacleEmojis = ["🍔", "🌶️", "🔥", "🧀", "🥤"];

  const startGame = useCallback(() => {
    const g = gameRef.current;
    g.running = true; g.score = 0; g.speed = 3.5; g.frame = 0;
    g.dog = { y: GROUND - DOG_H, vy: 0, grounded: true };
    g.obstacles = [];
    setScore(0); setGameOver(false); setStarted(true);
    if (!rafRef.current) loop();
  }, []);

  const jump = useCallback(() => {
    const g = gameRef.current;
    if (!g.running) { startGame(); return; }
    if (g.dog.grounded) { g.dog.vy = JUMP; g.dog.grounded = false; }
  }, [startGame]);

  // Touch and keyboard controls
  useEffect(() => {
    const onKey = (e) => { if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); jump(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump]);

  const loop = useCallback(() => {
    const g = gameRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // Update
    if (g.running) {
      g.frame++;
      g.score = Math.floor(g.frame / 6);
      setScore(g.score);

      // Dog physics
      g.dog.vy += GRAVITY;
      g.dog.y += g.dog.vy;
      if (g.dog.y >= GROUND - DOG_H) {
        g.dog.y = GROUND - DOG_H;
        g.dog.vy = 0;
        g.dog.grounded = true;
      }

      // Spawn obstacles
      if (g.frame % Math.max(40, 80 - Math.floor(g.score / 10)) === 0) {
        const h = 20 + Math.random() * 14;
        g.obstacles.push({
          x: W + 10,
          y: GROUND - h,
          w: 22, h,
          emoji: obstacleEmojis[Math.floor(Math.random() * obstacleEmojis.length)],
        });
      }

      // Move obstacles
      g.obstacles.forEach(o => { o.x -= g.speed; });
      g.obstacles = g.obstacles.filter(o => o.x > -30);

      // Speed up
      g.speed = 3.5 + g.score * 0.015;

      // Collision
      const dogBox = { x: 20, y: g.dog.y, w: DOG_W - 6, h: DOG_H - 4 };
      for (const o of g.obstacles) {
        if (dogBox.x < o.x + o.w - 4 && dogBox.x + dogBox.w > o.x + 4 && dogBox.y + dogBox.h > o.y + 4) {
          g.running = false;
          if (g.score > g.highScore) { g.highScore = g.score; setHighScore(g.score); }
          setGameOver(true);
          break;
        }
      }
    }

    // Draw
    ctx.clearRect(0, 0, W, H);

    // Ground
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    ctx.lineTo(W, GROUND);
    ctx.stroke();

    // Ground dots
    ctx.fillStyle = "#222";
    for (let i = 0; i < W; i += 20) {
      const offset = g.running ? (g.frame * g.speed) % 20 : 0;
      ctx.fillRect((i - offset + W) % W, GROUND + 5, 8, 1);
    }

    // Dog (hot dog emoji)
    ctx.font = `${DOG_H}px serif`;
    ctx.textBaseline = "top";
    const bounce = g.dog.grounded && g.running ? Math.sin(g.frame * 0.3) * 2 : 0;
    ctx.fillText("🌭", 16, g.dog.y + bounce);

    // Obstacles
    g.obstacles.forEach(o => {
      ctx.font = `${o.h}px serif`;
      ctx.fillText(o.emoji, o.x, o.y);
    });

    // Score
    ctx.fillStyle = "#666";
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "right";
    ctx.fillText(`${g.score}`, W - 10, 16);
    if (g.highScore > 0) {
      ctx.fillStyle = "#444";
      ctx.font = "11px monospace";
      ctx.fillText(`HI ${g.highScore}`, W - 10, 32);
    }
    ctx.textAlign = "left";

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // Cleanup
  useEffect(() => { return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }; }, []);

  return (
    <div style={{ background: "#111", borderRadius: 12, border: "1px solid #222", marginBottom: 16, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "#888", fontWeight: 600 }}>🎮 Jugá mientras esperás</span>
        {highScore > 0 && <span style={{ fontSize: 11, color: "#f59e0b", fontFamily: "monospace" }}>🏆 {highScore}</span>}
      </div>
      <div style={{ position: "relative", cursor: "pointer" }} onClick={jump} onTouchStart={(e) => { e.preventDefault(); jump(); }}>
        <canvas ref={canvasRef} width={W} height={H} style={{ display: "block", width: "100%", height: "auto", touchAction: "none" }} />
        {!started && (
          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}>
            <p style={{ fontSize: 28, margin: "0 0 4px" }}>🌭</p>
            <p style={{ color: "#fff", fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>Freakie Runner</p>
            <p style={{ color: "#aaa", fontSize: 12, margin: 0 }}>Tocá para saltar</p>
          </div>
        )}
        {gameOver && (
          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}>
            <p style={{ color: "#ef4444", fontSize: 16, fontWeight: 800, margin: "0 0 4px" }}>¡GAME OVER!</p>
            <p style={{ color: "#f97316", fontSize: 22, fontWeight: 800, fontFamily: "monospace", margin: "0 0 4px" }}>{score}</p>
            <p style={{ color: "#aaa", fontSize: 12, margin: 0 }}>Tocá para reintentar</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// COUNTDOWN TIMER
// ═══════════════════════════════════════════════
function CountdownTimer({ prepStartedAt, prepMinutes }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const endTime = prepStartedAt + prepMinutes * 60 * 1000;
  const remaining = Math.max(0, endTime - now);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const progress = 1 - remaining / (prepMinutes * 60 * 1000);
  const isOvertime = remaining === 0;
  const circumference = 2 * Math.PI * 54;
  const dashOffset = circumference * (1 - progress);

  return (
    <div style={{ textAlign: "center", padding: "20px 0", marginBottom: 16 }}>
      <div style={{ position: "relative", width: 140, height: 140, margin: "0 auto 12px" }}>
        <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="70" cy="70" r="54" fill="none" stroke="#222" strokeWidth="8" />
          <circle cx="70" cy="70" r="54" fill="none"
            stroke={isOvertime ? "#10b981" : progress > 0.75 ? "#ef4444" : progress > 0.5 ? "#f59e0b" : "#3b82f6"}
            strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s" }} />
        </svg>
        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          {isOvertime ? (
            <>
              <div style={{ fontSize: 28, marginBottom: 2 }}>✨</div>
              <div style={{ fontSize: 13, color: "#10b981", fontWeight: 700 }}>¡Casi listo!</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#fff", fontFamily: "monospace", letterSpacing: 2 }}>
                {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
              </div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>minutos restantes</div>
            </>
          )}
        </div>
      </div>
      <p style={{ color: "#888", fontSize: 13, margin: 0 }}>
        {isOvertime ? "Tu pedido está casi listo para salir" : "Estamos preparando tu pedido con cariño 🌭"}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════
function OrderDetails({ order }) {
  return (<>
    <div style={S.sec}><h3 style={S.secTitle}>👤 Cliente</h3><p style={S.txt}>{order.customer?.name}</p><p style={S.txt}>📱 {order.customer?.phone}</p></div>
    <div style={S.sec}><h3 style={S.secTitle}>🛒 Productos</h3>{(order.items || []).map((it, i) => <div key={i} style={S.row}><span>{it.qty}x {it.name}</span><span style={{ fontWeight: 700 }}>${(it.price * it.qty).toFixed(2)}</span></div>)}<div style={{ ...S.row, borderTop: "2px solid #333", paddingTop: 8, marginTop: 8 }}><span style={{ fontWeight: 800 }}>Total</span><span style={{ fontWeight: 800, color: "#f97316" }}>${order.total?.toFixed(2)}</span></div></div>
    {order.delivery?.type === "delivery" && (<div style={S.sec}><h3 style={S.secTitle}>📍 Entrega</h3><p style={S.txt}>{order.delivery.address}</p><p style={S.txt}>🏠 {order.delivery.houseNum} · 🏙️ {order.delivery.city}</p><p style={S.txt}>📌 {order.delivery.reference}</p>{order.delivery.coords && <a href={`https://www.google.com/maps?q=${order.delivery.coords.lat},${order.delivery.coords.lng}`} target="_blank" rel="noopener noreferrer" style={S.mapLink}>🗺️ Ver en mapa</a>}</div>)}
    <div style={S.sec}><h3 style={S.secTitle}>💳 Pago</h3><p style={S.txt}>{order.payment === "cash" ? "💵 Efectivo" : order.payment === "transfer" ? "🏦 Transferencia" : "💳 Tarjeta"}</p></div>
  </>);
}

function OrderList({ orders, onSelect }) {
  if (orders.length === 0) return <div style={S.empty}><p style={{ fontSize: 36 }}>📭</p><p>No hay pedidos</p></div>;
  return orders.map(([id, o]) => {
    const st = getStatus(o.status);
    return (
      <div key={id} style={S.orderCard} onClick={() => onSelect([id, o])}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontWeight: 800, fontFamily: "monospace", color: "#fff", fontSize: 14 }}>{o.orderId}</span><span style={{ ...S.badge, background: st.color }}>{st.icon} {st.label}</span></div>
        <div style={{ fontSize: 13, color: "#ccc", marginBottom: 3 }}>👤 {o.customer?.name}</div>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{(o.items || []).map(i => `${i.qty}x ${i.name}`).join(", ")}</div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontWeight: 700, color: "#f97316" }}>${o.total?.toFixed(2)}</span><span style={{ fontSize: 11, color: "#666" }}>{o.branch ? `📍 ${getBranch(o.branch).name}` : ""} {timeAgo(o.createdAt)}</span></div>
      </div>);
  });
}

// ═══════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════
const S = {
  loginWrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", padding: 20, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  loginCard: { background: "#111", borderRadius: 16, padding: 32, width: "100%", maxWidth: 380, border: "1px solid #222" },
  loginTitle: { textAlign: "center", fontSize: 24, fontWeight: 800, color: "#fff", margin: "0 0 4px" },
  loginSub: { textAlign: "center", fontSize: 14, color: "#888", margin: "0 0 24px" },
  codeInput: { width: "100%", padding: "14px", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 18, marginBottom: 12, boxSizing: "border-box", outline: "none", textAlign: "center", letterSpacing: 3, fontFamily: "monospace", fontWeight: 700 },
  error: { color: "#ef4444", fontSize: 13, textAlign: "center", margin: "0 0 12px" },
  container: { maxWidth: 600, margin: "0 auto", padding: 16, background: "#0a0a0a", minHeight: "100vh", color: "#fff", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  center: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", color: "#fff", fontFamily: '-apple-system, sans-serif', flexDirection: "column" },
  topBar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 },
  topTitle: { fontSize: 18, fontWeight: 700, color: "#fff", margin: 0, flex: 1 },
  logo: { fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 },
  backBtn: { background: "none", border: "none", color: "#60a5fa", fontSize: 15, cursor: "pointer", padding: "4px 0", fontWeight: 600 },
  statsRow: { display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 4 },
  statCard: { flex: "1 0 0", minWidth: 70, padding: "10px 6px", borderRadius: 10, border: "2px solid #333", textAlign: "center", cursor: "pointer", background: "#111" },
  orderCard: { background: "#111", borderRadius: 12, padding: 14, marginBottom: 8, border: "1px solid #222", cursor: "pointer" },
  card: { background: "#111", borderRadius: 12, padding: 18, border: "1px solid #222", marginBottom: 14 },
  badge: { display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: "#fff" },
  sec: { marginBottom: 18 },
  secTitle: { fontSize: 13, fontWeight: 700, color: "#999", margin: "0 0 6px" },
  txt: { fontSize: 14, color: "#ccc", margin: "3px 0" },
  row: { display: "flex", justifyContent: "space-between", fontSize: 14, color: "#ccc", padding: "3px 0" },
  mapLink: { display: "inline-block", marginTop: 8, padding: "8px 14px", background: "#1a1a2e", borderRadius: 8, color: "#60a5fa", textDecoration: "none", fontSize: 13, fontWeight: 600 },
  select: { width: "100%", padding: "10px 14px", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 14, boxSizing: "border-box" },
  branchBtn: { padding: "14px 16px", background: "#111", border: "2px solid #333", borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", textAlign: "left", width: "100%", marginBottom: 6 },
  btnPrimary: { width: "100%", padding: "13px", background: "#f97316", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer" },
  btnSec: { padding: "10px 16px", background: "#222", color: "#ccc", border: "1px solid #333", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnSmall: { padding: "7px 12px", background: "#222", color: "#ccc", border: "1px solid #333", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  btnDanger: { width: "100%", padding: "12px", background: "#7f1d1d", color: "#fca5a5", border: "1px solid #991b1b", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 16 },
  btnAction: { width: "100%", padding: "14px", background: "#0a1a3a", color: "#60a5fa", border: "2px solid #2563eb", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 12 },
  btnQuick: { width: "100%", padding: "10px", background: "#0a1a3a", color: "#60a5fa", border: "1px solid #2563eb", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  empty: { textAlign: "center", padding: "40px 20px", color: "#666", fontSize: 14 },
  footer: { textAlign: "center", padding: "20px 0", fontSize: 11, color: "#444" },
};
