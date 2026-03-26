import { useState, useEffect, useCallback, useRef } from "react";

// ═══════════════════════════════════════════════
// FIREBASE CONFIG
// ═══════════════════════════════════════════════
const FB = "https://freakie-dogs-default-rtdb.firebaseio.com";

async function fbGet(p) {
  const r = await fetch(`${FB}/${p}.json`);
  return r.json();
}
async function fbSet(p, d) {
  await fetch(`${FB}/${p}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
}
async function fbUpdate(p, d) {
  await fetch(`${FB}/${p}.json`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
}
async function fbPush(p, d) {
  const r = await fetch(`${FB}/${p}.json`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
  return r.json();
}

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

const ROLES = {
  admin: { label: "Administrador", color: "#f97316" },
  encargado: { label: "Encargado", color: "#3b82f6" },
  asignador: { label: "Asignador", color: "#8b5cf6" },
  driver: { label: "Motorista", color: "#10b981" },
};

function getStatus(id) { return STATUSES.find(s => s.id === id) || STATUSES[0]; }
function getBranch(id) { return BRANCHES.find(b => b.id === id) || { id: "", name: "—" }; }
function timeAgo(ts) {
  if (!ts) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "Ahora";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

// Seed default users if none exist
async function seedUsers() {
  const existing = await fbGet("users");
  if (existing) return;
  await fbSet("users", {
    admin1: { code: "ADMIN01", role: "admin", name: "Administrador General", branch: null, active: true },
    enc_venecia: { code: "ENC-VEN", role: "encargado", name: "Encargado Venecia", branch: "venecia", active: true },
    enc_lourdes: { code: "ENC-LOU", role: "encargado", name: "Encargado Lourdes", branch: "lourdes", active: true },
    enc_plaza: { code: "ENC-PLZ", role: "encargado", name: "Encargado Plaza Mundo", branch: "plaza_mundo", active: true },
    enc_usulutan: { code: "ENC-USU", role: "encargado", name: "Encargado Usulután", branch: "usulutan", active: true },
    enc_santaTecla: { code: "ENC-STC", role: "encargado", name: "Encargado Santa Tecla", branch: "santa_tecla", active: true },
  });
}

// ═══════════════════════════════════════════════
// APP ROUTER
// ═══════════════════════════════════════════════
export default function App() {
  const path = window.location.pathname;
  if (path.startsWith("/driver")) return <PlaceholderPage icon="🏍️" title="Portal de Motorista" sub="Próximamente — Fase B" />;
  if (path.startsWith("/track/")) return <PlaceholderPage icon="📍" title="Rastreo de Pedido" sub="Próximamente — Fase B" />;
  return <MainApp />;
}

function PlaceholderPage({ icon, title, sub }) {
  return <div style={S.center}><div style={{ textAlign: "center" }}><p style={{ fontSize: 48 }}>{icon}</p><h2 style={{ color: "#fff" }}>{title}</h2><p style={{ color: "#888" }}>{sub}</p></div></div>;
}

// ═══════════════════════════════════════════════
// LOGIN + ROLE ROUTING
// ═══════════════════════════════════════════════
function MainApp() {
  const [user, setUser] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { seedUsers().then(() => setLoading(false)); }, []);

  const handleLogin = async () => {
    setError("");
    const users = await fbGet("users");
    if (!users) { setError("Error de conexión"); return; }
    const found = Object.entries(users).find(([, u]) => u.code === code.toUpperCase() && u.active);
    if (!found) { setError("Código no válido"); return; }
    setUser({ id: found[0], ...found[1] });
  };

  if (loading) return <div style={S.center}><p style={{ color: "#888" }}>Cargando...</p></div>;

  if (!user) {
    return (
      <div style={S.loginContainer}>
        <div style={S.loginCard}>
          <div style={{ fontSize: 48, textAlign: "center", marginBottom: 8 }}>🌭</div>
          <h1 style={S.loginTitle}>Freakie Dogs</h1>
          <p style={S.loginSub}>Sistema de Gestión</p>
          <input style={S.codeInput} type="text" placeholder="Tu código de acceso" value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleLogin()} maxLength={10} />
          {error && <p style={S.error}>{error}</p>}
          <button style={S.btnPrimary} onClick={handleLogin}>Ingresar</button>
          <p style={{ fontSize: 11, color: "#555", textAlign: "center", marginTop: 16 }}>
            Admin: ADMIN01 · Encargados: ENC-VEN, ENC-LOU, ENC-PLZ, ENC-USU, ENC-STC
          </p>
        </div>
      </div>
    );
  }

  const logout = () => { setUser(null); setCode(""); };
  if (user.role === "admin") return <AdminDash user={user} onLogout={logout} />;
  if (user.role === "encargado") return <EncargadoDash user={user} onLogout={logout} />;
  return <div style={S.center}><p style={{ color: "#888" }}>Rol no disponible aún</p></div>;
}

// ═══════════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════════
function AdminDash({ user, onLogout }) {
  const [orders, setOrders] = useState({});
  const [users, setUsers] = useState({});
  const [view, setView] = useState("list"); // list | detail | users
  const [selOrder, setSelOrder] = useState(null);
  const [filter, setFilter] = useState("new");
  const poll = useRef(null);

  const fetch_ = useCallback(async () => {
    const [o, u] = await Promise.all([fbGet("orders"), fbGet("users")]);
    setOrders(o || {}); setUsers(u || {});
  }, []);

  useEffect(() => { fetch_(); poll.current = setInterval(fetch_, 5000); return () => clearInterval(poll.current); }, [fetch_]);

  const assignBranch = async (oid, bid) => {
    await fbUpdate(`orders/${oid}`, { branch: bid, status: "assigned", assignedAt: Date.now(), assignedBy: user.name });
    setView("list"); setSelOrder(null); fetch_();
  };

  const createTest = async () => {
    const names = ["María López", "Carlos Rivas", "Ana Martínez", "José Hernández", "Laura García"];
    const itemSets = [
      [{ name: "Freakie Burger", qty: 2, price: 7.99 }, { name: "Combo Individual", qty: 1, price: 3.99 }],
      [{ name: "Burger Box", qty: 1, price: 19.50 }, { name: "Coca Cola", qty: 2, price: 1.50 }],
      [{ name: "Combo Trío", qty: 1, price: 11.99 }],
      [{ name: "Combpleto", qty: 1, price: 31.99 }],
      [{ name: "Freakie Dog", qty: 4, price: 1.99 }, { name: "Freakie Fries", qty: 4, price: 1.99 }],
    ];
    const its = itemSets[Math.floor(Math.random() * itemSets.length)];
    const tot = its.reduce((s, i) => s + i.price * i.qty, 0);
    await fbPush("orders", {
      orderId: "FD-" + Math.random().toString().substring(2, 10),
      customer: { name: names[Math.floor(Math.random() * names.length)], phone: "7" + Math.random().toString().substring(2, 9) },
      items: its, total: Math.round(tot * 100) / 100,
      delivery: { type: "delivery", address: "Calle #" + Math.floor(Math.random() * 100), houseNum: "Casa " + Math.floor(Math.random() * 50), city: "San Salvador", reference: "Cerca del parque", coords: { lat: 13.6783 + (Math.random() - 0.5) * 0.05, lng: -89.2808 + (Math.random() - 0.5) * 0.05 } },
      payment: ["cash", "transfer", "card"][Math.floor(Math.random() * 3)],
      status: "new", branch: null, driverId: null, statusUpdates: { new: Date.now() }, createdAt: Date.now(), note: "",
    });
    fetch_();
  };

  const all = Object.entries(orders).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
  const filtered = filter === "all" ? all : filter === "active" ? all.filter(([, o]) => !["delivered", "cancelled"].includes(o.status)) : all.filter(([, o]) => o.status === filter);
  const cnt = { new: all.filter(([, o]) => o.status === "new").length, active: all.filter(([, o]) => !["delivered", "cancelled", "new"].includes(o.status)).length, delivered: all.filter(([, o]) => o.status === "delivered").length };

  // ── DETAIL ──
  if (view === "detail" && selOrder) {
    const [oid, order] = selOrder;
    const st = getStatus(order.status);
    return (
      <div style={S.container}>
        <div style={S.topBar}>
          <button style={S.backBtn} onClick={() => { setView("list"); setSelOrder(null); }}>← Volver</button>
          <h2 style={S.topTitle}>{order.orderId}</h2>
        </div>
        <div style={S.card}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ ...S.badge, background: st.color }}>{st.icon} {st.label}</span>
            <span style={{ fontSize: 12, color: "#888" }}>{timeAgo(order.createdAt)}</span>
            {order.branch && <span style={{ ...S.badge, background: "#334155" }}>📍 {getBranch(order.branch).name}</span>}
          </div>

          {order.status === "new" && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={S.secTitle}>📤 Asignar a sucursal</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {BRANCHES.map(b => (
                  <button key={b.id} style={S.branchBtn} onClick={() => assignBranch(oid, b.id)}>📍 {b.name}</button>
                ))}
              </div>
            </div>
          )}

          <div style={S.sec}><h3 style={S.secTitle}>👤 Cliente</h3><p style={S.txt}>{order.customer?.name}</p><p style={S.txt}>📱 {order.customer?.phone}</p></div>

          <div style={S.sec}>
            <h3 style={S.secTitle}>🛒 Productos</h3>
            {(order.items || []).map((it, i) => (<div key={i} style={S.row}><span>{it.qty}x {it.name}</span><span style={{ fontWeight: 700 }}>${(it.price * it.qty).toFixed(2)}</span></div>))}
            <div style={{ ...S.row, borderTop: "2px solid #333", paddingTop: 8, marginTop: 8 }}><span style={{ fontWeight: 800 }}>Total</span><span style={{ fontWeight: 800, color: "#f97316" }}>${order.total?.toFixed(2)}</span></div>
          </div>

          {order.delivery?.type === "delivery" && (
            <div style={S.sec}>
              <h3 style={S.secTitle}>📍 Entrega</h3>
              <p style={S.txt}>{order.delivery.address}</p>
              <p style={S.txt}>🏠 {order.delivery.houseNum} · 🏙️ {order.delivery.city}</p>
              <p style={S.txt}>📌 {order.delivery.reference}</p>
              {order.delivery.coords && (<a href={`https://www.google.com/maps?q=${order.delivery.coords.lat},${order.delivery.coords.lng}`} target="_blank" rel="noopener noreferrer" style={S.mapLink}>🗺️ Ver en mapa</a>)}
            </div>
          )}

          <div style={S.sec}><h3 style={S.secTitle}>💳 Pago</h3><p style={S.txt}>{order.payment === "cash" ? "💵 Efectivo" : order.payment === "transfer" ? "🏦 Transferencia" : "💳 Tarjeta"}</p></div>

          {!["delivered", "cancelled"].includes(order.status) && (
            <button style={S.btnDanger} onClick={async () => { if (window.confirm("¿Cancelar?")) { await fbUpdate(`orders/${oid}`, { status: "cancelled" }); setView("list"); fetch_(); } }}>❌ Cancelar pedido</button>
          )}
        </div>
      </div>
    );
  }

  // ── USERS ──
  if (view === "users") {
    return (
      <div style={S.container}>
        <div style={S.topBar}>
          <button style={S.backBtn} onClick={() => setView("list")}>← Volver</button>
          <h2 style={S.topTitle}>Usuarios del Sistema</h2>
        </div>
        {Object.entries(users).map(([id, u]) => {
          const rl = ROLES[u.role] || {};
          return (
            <div key={id} style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: "#fff" }}>{u.name}</span>
                <span style={{ ...S.badge, background: rl.color, fontSize: 10 }}>{rl.label}</span>
              </div>
              <div style={{ fontSize: 14, color: "#f59e0b", fontFamily: "monospace" }}>Código: {u.code}</div>
              {u.branch && <div style={{ fontSize: 13, color: "#888" }}>📍 {getBranch(u.branch).name}</div>}
            </div>
          );
        })}
      </div>
    );
  }

  // ── LIST ──
  return (
    <div style={S.container}>
      <div style={S.topBar}>
        <div><h1 style={S.logo}>🌭 Freakie Dogs</h1><p style={{ fontSize: 12, color: "#f97316", margin: 0 }}>Administrador</p></div>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={S.btnSmall} onClick={() => setView("users")}>👥</button>
          <button style={{ ...S.btnSmall, color: "#ef4444" }} onClick={onLogout}>Salir</button>
        </div>
      </div>

      <div style={S.statsRow}>
        {[{ l: "Nuevos", c: cnt.new, cl: "#f59e0b", f: "new" }, { l: "Activos", c: cnt.active, cl: "#3b82f6", f: "active" }, { l: "Entregados", c: cnt.delivered, cl: "#10b981", f: "delivered" }, { l: "Todos", c: all.length, cl: "#888", f: "all" }].map(s => (
          <button key={s.f} onClick={() => setFilter(s.f)} style={{ ...S.statCard, borderColor: filter === s.f ? s.cl : "#333", background: filter === s.f ? s.cl + "15" : "#111" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.cl }}>{s.c}</div>
            <div style={{ fontSize: 10, color: "#999" }}>{s.l}</div>
          </button>
        ))}
      </div>

      <button style={{ ...S.btnSec, width: "100%", marginBottom: 12 }} onClick={createTest}>🧪 Crear pedido de prueba</button>

      {filtered.length === 0 ? (
        <div style={S.empty}><p style={{ fontSize: 36 }}>📭</p><p>No hay pedidos</p></div>
      ) : filtered.map(([id, o]) => {
        const st = getStatus(o.status);
        return (
          <div key={id} style={S.orderCard} onClick={() => { setSelOrder([id, o]); setView("detail"); }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontWeight: 800, fontFamily: "monospace", color: "#fff", fontSize: 14 }}>{o.orderId}</span>
              <span style={{ ...S.badge, background: st.color }}>{st.icon} {st.label}</span>
            </div>
            <div style={{ fontSize: 13, color: "#ccc", marginBottom: 3 }}>👤 {o.customer?.name} · 📱 {o.customer?.phone}</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{(o.items || []).map(i => `${i.qty}x ${i.name}`).join(", ")}</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, color: "#f97316" }}>${o.total?.toFixed(2)}</span>
              <span style={{ fontSize: 11, color: "#666" }}>{o.branch ? `📍 ${getBranch(o.branch).name}` : ""} {timeAgo(o.createdAt)}</span>
            </div>
          </div>
        );
      })}
      <div style={S.footer}>Actualizando cada 5s · Freakie Dogs © 2026</div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// ENCARGADO DASHBOARD
// ═══════════════════════════════════════════════
function EncargadoDash({ user, onLogout }) {
  const [orders, setOrders] = useState({});
  const [view, setView] = useState("list");
  const [selOrder, setSelOrder] = useState(null);
  const [filter, setFilter] = useState("assigned");
  const poll = useRef(null);

  const fetch_ = useCallback(async () => { const o = await fbGet("orders"); setOrders(o || {}); }, []);
  useEffect(() => { fetch_(); poll.current = setInterval(fetch_, 5000); return () => clearInterval(poll.current); }, [fetch_]);

  const myOrders = Object.entries(orders).filter(([, o]) => o.branch === user.branch).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
  const filtered = filter === "all" ? myOrders : myOrders.filter(([, o]) => o.status === filter);
  const cnt = { assigned: myOrders.filter(([, o]) => o.status === "assigned").length, preparing: myOrders.filter(([, o]) => o.status === "preparing").length, ready: myOrders.filter(([, o]) => o.status === "ready").length };

  const setStatus = async (oid, s) => {
    await fbUpdate(`orders/${oid}`, { status: s, [`statusUpdates/${s}`]: Date.now() });
    fetch_();
  };

  // ── DETAIL ──
  if (view === "detail" && selOrder) {
    const [oid, order] = selOrder;
    const st = getStatus(order.status);
    return (
      <div style={S.container}>
        <div style={S.topBar}>
          <button style={S.backBtn} onClick={() => { setView("list"); setSelOrder(null); }}>← Volver</button>
          <h2 style={S.topTitle}>{order.orderId}</h2>
        </div>
        <div style={S.card}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ ...S.badge, background: st.color }}>{st.icon} {st.label}</span>
            <span style={{ fontSize: 12, color: "#888" }}>{timeAgo(order.createdAt)}</span>
          </div>

          <div style={S.sec}><h3 style={S.secTitle}>👤 Cliente</h3><p style={S.txt}>{order.customer?.name}</p><p style={S.txt}>📱 {order.customer?.phone}</p></div>

          <div style={S.sec}>
            <h3 style={S.secTitle}>🛒 Productos</h3>
            {(order.items || []).map((it, i) => (<div key={i} style={S.row}><span>{it.qty}x {it.name}</span><span style={{ fontWeight: 700 }}>${(it.price * it.qty).toFixed(2)}</span></div>))}
            <div style={{ ...S.row, borderTop: "2px solid #333", paddingTop: 8, marginTop: 8 }}><span style={{ fontWeight: 800 }}>Total</span><span style={{ fontWeight: 800, color: "#f97316" }}>${order.total?.toFixed(2)}</span></div>
          </div>

          {order.delivery?.type === "delivery" && (
            <div style={S.sec}>
              <h3 style={S.secTitle}>📍 Entrega</h3>
              <p style={S.txt}>{order.delivery.address}</p>
              <p style={S.txt}>🏠 {order.delivery.houseNum} · 🏙️ {order.delivery.city}</p>
              <p style={S.txt}>📌 {order.delivery.reference}</p>
              {order.delivery.coords && (<a href={`https://www.google.com/maps?q=${order.delivery.coords.lat},${order.delivery.coords.lng}`} target="_blank" rel="noopener noreferrer" style={S.mapLink}>🗺️ Ver en mapa</a>)}
            </div>
          )}

          <div style={S.sec}><h3 style={S.secTitle}>💳 Pago</h3><p style={S.txt}>{order.payment === "cash" ? "💵 Efectivo" : order.payment === "transfer" ? "🏦 Transferencia" : "💳 Tarjeta"}</p></div>

          {order.status === "assigned" && (
            <button style={S.btnAction} onClick={() => { setStatus(oid, "preparing"); setSelOrder([oid, { ...order, status: "preparing" }]); }}>👨‍🍳 Empezar a preparar</button>
          )}
          {order.status === "preparing" && (
            <button style={{ ...S.btnAction, background: "#1a0a2e", color: "#a78bfa", borderColor: "#7c3aed" }}
              onClick={() => { setStatus(oid, "ready"); setSelOrder([oid, { ...order, status: "ready" }]); }}>✨ Marcar como listo para entrega</button>
          )}
        </div>
      </div>
    );
  }

  // ── LIST ──
  const br = getBranch(user.branch);
  return (
    <div style={S.container}>
      <div style={S.topBar}>
        <div><h1 style={S.logo}>🌭 {br.name}</h1><p style={{ fontSize: 12, color: "#3b82f6", margin: 0 }}>Encargado de Sucursal</p></div>
        <button style={{ ...S.btnSmall, color: "#ef4444" }} onClick={onLogout}>Salir</button>
      </div>

      <div style={S.statsRow}>
        {[{ l: "Nuevos", c: cnt.assigned, cl: "#6366f1", f: "assigned" }, { l: "Preparando", c: cnt.preparing, cl: "#3b82f6", f: "preparing" }, { l: "Listos", c: cnt.ready, cl: "#8b5cf6", f: "ready" }].map(s => (
          <button key={s.f} onClick={() => setFilter(s.f)} style={{ ...S.statCard, borderColor: filter === s.f ? s.cl : "#333", background: filter === s.f ? s.cl + "15" : "#111" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.cl }}>{s.c}</div>
            <div style={{ fontSize: 10, color: "#999" }}>{s.l}</div>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={S.empty}><p style={{ fontSize: 36 }}>📭</p><p>No hay pedidos</p></div>
      ) : filtered.map(([id, o]) => {
        const st = getStatus(o.status);
        return (
          <div key={id} style={S.orderCard} onClick={() => { setSelOrder([id, o]); setView("detail"); }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontWeight: 800, fontFamily: "monospace", color: "#fff", fontSize: 14 }}>{o.orderId}</span>
              <span style={{ ...S.badge, background: st.color }}>{st.icon} {st.label}</span>
            </div>
            <div style={{ fontSize: 13, color: "#ccc", marginBottom: 3 }}>👤 {o.customer?.name}</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{(o.items || []).map(i => `${i.qty}x ${i.name}`).join(", ")}</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, color: "#f97316" }}>${o.total?.toFixed(2)}</span>
              <span style={{ fontSize: 11, color: "#555" }}>{timeAgo(o.createdAt)}</span>
            </div>
            {o.status === "assigned" && (
              <button style={{ ...S.btnQuick, marginTop: 8 }} onClick={e => { e.stopPropagation(); setStatus(id, "preparing"); }}>👨‍🍳 Preparar</button>
            )}
            {o.status === "preparing" && (
              <button style={{ ...S.btnQuick, marginTop: 8, background: "#1a0a2e", color: "#a78bfa", borderColor: "#7c3aed" }}
                onClick={e => { e.stopPropagation(); setStatus(id, "ready"); }}>✨ Listo</button>
            )}
          </div>
        );
      })}
      <div style={S.footer}>Actualizando cada 5s · {br.name}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════
const S = {
  loginContainer: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", padding: 20, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  loginCard: { background: "#111", borderRadius: 16, padding: 32, width: "100%", maxWidth: 380, border: "1px solid #222" },
  loginTitle: { textAlign: "center", fontSize: 24, fontWeight: 800, color: "#fff", margin: "0 0 4px" },
  loginSub: { textAlign: "center", fontSize: 14, color: "#888", margin: "0 0 24px" },
  codeInput: { width: "100%", padding: "14px", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 18, marginBottom: 12, boxSizing: "border-box", outline: "none", textAlign: "center", letterSpacing: 3, fontFamily: "monospace", fontWeight: 700 },
  error: { color: "#ef4444", fontSize: 13, textAlign: "center", margin: "0 0 12px" },
  container: { maxWidth: 600, margin: "0 auto", padding: 16, background: "#0a0a0a", minHeight: "100vh", color: "#fff", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  center: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", color: "#fff", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
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
  branchBtn: { padding: "14px 16px", background: "#111", border: "2px solid #333", borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", textAlign: "left" },
  btnPrimary: { width: "100%", padding: "13px", background: "#f97316", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer" },
  btnSec: { padding: "10px 16px", background: "#222", color: "#ccc", border: "1px solid #333", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnSmall: { padding: "7px 12px", background: "#222", color: "#ccc", border: "1px solid #333", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  btnDanger: { width: "100%", padding: "12px", background: "#7f1d1d", color: "#fca5a5", border: "1px solid #991b1b", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 16 },
  btnAction: { width: "100%", padding: "14px", background: "#0a1a3a", color: "#60a5fa", border: "2px solid #2563eb", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 12 },
  btnQuick: { width: "100%", padding: "10px", background: "#0a1a3a", color: "#60a5fa", border: "1px solid #2563eb", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  empty: { textAlign: "center", padding: "40px 20px", color: "#666", fontSize: 14 },
  footer: { textAlign: "center", padding: "20px 0", fontSize: 11, color: "#444" },
};
