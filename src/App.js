import { useState, useEffect, useCallback, useRef } from "react";

// ═══════════════════════════════════════════════
// FIREBASE CONFIG
// ═══════════════════════════════════════════════
const FIREBASE_URL = "https://freakie-dogs-default-rtdb.firebaseio.com";

async function fbGet(path) {
  const res = await fetch(`${FIREBASE_URL}/${path}.json`);
  return res.json();
}
async function fbSet(path, data) {
  await fetch(`${FIREBASE_URL}/${path}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
async function fbUpdate(path, data) {
  await fetch(`${FIREBASE_URL}/${path}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
async function fbPush(path, data) {
  const res = await fetch(`${FIREBASE_URL}/${path}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

// ═══════════════════════════════════════════════
// STATUS CONFIG
// ═══════════════════════════════════════════════
const STATUSES = [
  { id: "received", label: "Recibido", color: "#f59e0b", icon: "📋" },
  { id: "preparing", label: "Preparando", color: "#3b82f6", icon: "👨‍🍳" },
  { id: "on_the_way", label: "En camino", color: "#8b5cf6", icon: "🏍️" },
  { id: "delivered", label: "Entregado", color: "#10b981", icon: "✅" },
  { id: "cancelled", label: "Cancelado", color: "#ef4444", icon: "❌" },
];

function getStatus(id) {
  return STATUSES.find(s => s.id === id) || STATUSES[0];
}

// ═══════════════════════════════════════════════
// MAIN APP — Routes based on URL path
// ═══════════════════════════════════════════════
export default function App() {
  const path = window.location.pathname;

  if (path.startsWith("/driver")) {
    return <DriverView />;
  }
  if (path.startsWith("/track/")) {
    const orderId = path.split("/track/")[1];
    return <TrackingView orderId={orderId} />;
  }
  return <AdminPanel />;
}

// ═══════════════════════════════════════════════
// DRIVER VIEW — Motorista ve sus pedidos y comparte GPS
// ═══════════════════════════════════════════════
function DriverView() {
  const [screen, setScreen] = useState("login"); // login | orders | delivering
  const [driverCode, setDriverCode] = useState("");
  const [driverId, setDriverId] = useState(null);
  const [driverInfo, setDriverInfo] = useState(null);
  const [orders, setOrders] = useState({});
  const [activeDelivery, setActiveDelivery] = useState(null); // orderId being delivered
  const [error, setError] = useState("");
  const gpsRef = useRef(null);
  const pollRef = useRef(null);

  // Login with driver code
  const handleLogin = async () => {
    setError("");
    const driversData = await fbGet("drivers");
    if (!driversData) { setError("No hay motoristas registrados"); return; }

    const found = Object.entries(driversData).find(([, d]) => d.code === driverCode.toUpperCase());
    if (!found) { setError("Código no válido"); return; }

    setDriverId(found[0]);
    setDriverInfo(found[1]);
    setScreen("orders");
  };

  // Poll orders assigned to this driver
  const fetchOrders = useCallback(async () => {
    if (!driverId) return;
    try {
      const data = await fbGet("orders");
      setOrders(data || {});
    } catch (e) {
      console.error(e);
    }
  }, [driverId]);

  useEffect(() => {
    if (screen !== "login") {
      fetchOrders();
      pollRef.current = setInterval(fetchOrders, 5000);
      return () => clearInterval(pollRef.current);
    }
  }, [screen, fetchOrders]);

  // Get orders assigned to this driver
  const myOrders = Object.entries(orders)
    .filter(([, o]) => o.driverId === driverId && o.status !== "delivered" && o.status !== "cancelled")
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  const deliveredOrders = Object.entries(orders)
    .filter(([, o]) => o.driverId === driverId && o.status === "delivered")
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0))
    .slice(0, 5);

  // Start delivery — begin sharing GPS
  const startDelivery = async (orderId) => {
    await fbUpdate(`orders/${orderId}`, {
      status: "on_the_way",
      [`statusUpdates/on_the_way`]: Date.now(),
    });
    setActiveDelivery(orderId);

    // Start GPS tracking
    if (navigator.geolocation) {
      gpsRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const loc = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            timestamp: Date.now(),
            accuracy: pos.coords.accuracy,
          };
          fbSet(`tracking/${orderId}`, loc);
          fbSet(`drivers_location/${driverId}`, loc);
        },
        (err) => console.error("GPS error:", err),
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
      );
    }
    fetchOrders();
  };

  // Complete delivery
  const completeDelivery = async (orderId) => {
    // Stop GPS
    if (gpsRef.current) {
      navigator.geolocation.clearWatch(gpsRef.current);
      gpsRef.current = null;
    }
    await fbUpdate(`orders/${orderId}`, {
      status: "delivered",
      [`statusUpdates/delivered`]: Date.now(),
    });
    await fbSet(`tracking/${orderId}`, null); // Clean up tracking data
    setActiveDelivery(null);
    fetchOrders();
  };

  // Stop GPS on unmount
  useEffect(() => {
    return () => {
      if (gpsRef.current) navigator.geolocation.clearWatch(gpsRef.current);
    };
  }, []);

  // ── DRIVER LOGIN ──
  if (screen === "login") {
    return (
      <div style={ds.loginContainer}>
        <div style={ds.loginCard}>
          <div style={{ fontSize: 48, textAlign: "center", marginBottom: 8 }}>🏍️</div>
          <h1 style={ds.loginTitle}>Freakie Dogs</h1>
          <p style={ds.loginSub}>Portal de Motorista</p>
          <input
            style={ds.input}
            type="text"
            placeholder="Tu código (ej: M3KX2)"
            value={driverCode}
            onChange={e => setDriverCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            maxLength={6}
          />
          {error && <p style={{ color: "#ef4444", fontSize: 13, textAlign: "center", margin: "0 0 12px" }}>{error}</p>}
          <button style={ds.btnPrimary} onClick={handleLogin}>Ingresar</button>
        </div>
      </div>
    );
  }

  // ── DRIVER ORDERS ──
  return (
    <div style={ds.container}>
      <div style={ds.topBar}>
        <div>
          <h1 style={ds.logoText}>🏍️ {driverInfo?.name}</h1>
          <p style={{ fontSize: 13, color: "#888", margin: 0 }}>Código: {driverInfo?.code}</p>
        </div>
        <button style={ds.btnSmall} onClick={() => { if (gpsRef.current) navigator.geolocation.clearWatch(gpsRef.current); setScreen("login"); }}>
          Salir
        </button>
      </div>

      {activeDelivery && (
        <div style={{ background: "#1a0a2e", border: "2px solid #8b5cf6", borderRadius: 12, padding: 16, marginBottom: 16, textAlign: "center" }}>
          <p style={{ color: "#a78bfa", fontSize: 14, margin: "0 0 4px" }}>📡 Compartiendo ubicación en tiempo real</p>
          <p style={{ color: "#666", fontSize: 12, margin: 0 }}>Tu cliente puede ver tu posición en el mapa</p>
        </div>
      )}

      {/* Active orders */}
      <div style={{ marginBottom: 8 }}>
        <h2 style={{ fontSize: 16, color: "#999", margin: "0 0 12px" }}>
          📋 Pedidos asignados ({myOrders.length})
        </h2>
      </div>

      {myOrders.length === 0 ? (
        <div style={ds.emptyState}>
          <p style={{ fontSize: 40 }}>⏳</p>
          <p>No tenés pedidos asignados</p>
          <p style={{ fontSize: 13, color: "#555" }}>Esperá a que te asignen un pedido</p>
        </div>
      ) : (
        myOrders.map(([id, order]) => {
          const status = getStatus(order.status);
          const isDelivering = activeDelivery === id;
          return (
            <div key={id} style={{ ...ds.orderCard, borderColor: isDelivering ? "#8b5cf6" : "#222" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: 800, fontFamily: "monospace", color: "#fff" }}>{order.orderId}</span>
                <span style={{ ...ds.statusBadge, background: status.color }}>{status.icon} {status.label}</span>
              </div>

              <div style={{ fontSize: 14, color: "#ccc", marginBottom: 4 }}>
                👤 {order.customer?.name}
              </div>
              <div style={{ fontSize: 14, color: "#ccc", marginBottom: 4 }}>
                📱 {order.customer?.phone}
              </div>

              {order.delivery?.type === "delivery" && (
                <div style={{ background: "#1a1a1a", borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 13 }}>
                  <p style={{ color: "#ccc", margin: "2px 0" }}>📍 {order.delivery.address}</p>
                  <p style={{ color: "#ccc", margin: "2px 0" }}>🏠 {order.delivery.houseNum}</p>
                  <p style={{ color: "#ccc", margin: "2px 0" }}>📌 {order.delivery.reference}</p>
                  {order.delivery.coords && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${order.delivery.coords.lat},${order.delivery.coords.lng}&travelmode=driving`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "inline-block", marginTop: 6, padding: "6px 12px", background: "#1a3a1a", borderRadius: 6, color: "#4ade80", textDecoration: "none", fontSize: 13, fontWeight: 600 }}
                    >
                      🗺️ Abrir en Google Maps (navegación)
                    </a>
                  )}
                </div>
              )}

              <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>
                {(order.items || []).map(i => `${i.qty}x ${i.name}`).join(", ")}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontWeight: 700, color: "#f97316", fontSize: 16 }}>${order.total?.toFixed(2)}</span>
                <span style={{ fontSize: 12, color: "#888" }}>
                  {order.payment === "cash" ? "💵 Efectivo" : order.payment === "transfer" ? "🏦 Transferencia" : "💳 Tarjeta"}
                </span>
              </div>

              {/* Action buttons */}
              {order.status === "preparing" || order.status === "received" ? (
                <button
                  style={ds.btnDelivery}
                  onClick={() => startDelivery(id)}
                >
                  🏍️ Iniciar entrega
                </button>
              ) : isDelivering ? (
                <button
                  style={ds.btnComplete}
                  onClick={() => completeDelivery(id)}
                >
                  ✅ Marcar como entregado
                </button>
              ) : order.status === "on_the_way" && !isDelivering ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    style={{ ...ds.btnDelivery, flex: 1 }}
                    onClick={() => startDelivery(id)}
                  >
                    📡 Reanudar GPS
                  </button>
                  <button
                    style={{ ...ds.btnComplete, flex: 1 }}
                    onClick={() => completeDelivery(id)}
                  >
                    ✅ Entregado
                  </button>
                </div>
              ) : null}
            </div>
          );
        })
      )}

      {/* Recently delivered */}
      {deliveredOrders.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, color: "#999", margin: "20px 0 12px" }}>✅ Entregados recientes</h2>
          {deliveredOrders.map(([id, order]) => (
            <div key={id} style={{ ...ds.orderCard, opacity: 0.6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "monospace", color: "#fff" }}>{order.orderId}</span>
                <span style={{ color: "#10b981", fontSize: 13 }}>✅ Entregado</span>
              </div>
              <div style={{ fontSize: 13, color: "#888" }}>
                {order.customer?.name} — ${order.total?.toFixed(2)}
              </div>
            </div>
          ))}
        </>
      )}

      <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12, color: "#444" }}>
        Actualizando cada 5 segundos
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TRACKING VIEW — Cliente rastrea su pedido
// ═══════════════════════════════════════════════
function TrackingView({ orderId }) {
  const [order, setOrder] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const leafletLoaded = useRef(false);
  const pollRef = useRef(null);

  // Fetch order and tracking data
  const fetchTracking = useCallback(async () => {
    try {
      const [orderData, trackingData] = await Promise.all([
        fbGet(`orders/${orderId}`),
        fbGet(`tracking/${orderId}`),
      ]);
      if (orderData) setOrder(orderData);
      if (trackingData) setDriverLocation(trackingData);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchTracking();
    pollRef.current = setInterval(fetchTracking, 3000); // Poll every 3 seconds for tracking
    return () => clearInterval(pollRef.current);
  }, [fetchTracking]);

  // Load Leaflet and init map
  useEffect(() => {
    if (!driverLocation || leafletLoaded.current) return;

    const cssLink = document.createElement("link");
    cssLink.rel = "stylesheet";
    cssLink.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(cssLink);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      leafletLoaded.current = true;
      initMap(driverLocation);
    };
    document.head.appendChild(script);
  }, [driverLocation]);

  // Update marker position when driver location changes
  useEffect(() => {
    if (leafletLoaded.current && markerRef.current && driverLocation) {
      markerRef.current.setLatLng([driverLocation.lat, driverLocation.lng]);
      if (mapRef.current) {
        mapRef.current.panTo([driverLocation.lat, driverLocation.lng]);
      }
    }
  }, [driverLocation]);

  const initMap = (loc) => {
    if (!window.L || !document.getElementById("tracking-map")) return;

    const map = window.L.map("tracking-map").setView([loc.lat, loc.lng], 16);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(map);

    // Driver marker (motorcycle icon)
    const driverIcon = window.L.divIcon({
      html: '<div style="font-size:28px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5))">🏍️</div>',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      className: "",
    });
    const marker = window.L.marker([loc.lat, loc.lng], { icon: driverIcon }).addTo(map);
    markerRef.current = marker;

    // Destination marker (if available)
    if (order?.delivery?.coords) {
      const destIcon = window.L.divIcon({
        html: '<div style="font-size:24px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5))">📍</div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        className: "",
      });
      window.L.marker([order.delivery.coords.lat, order.delivery.coords.lng], { icon: destIcon }).addTo(map);
    }

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);
  };

  if (loading) {
    return (
      <div style={ts.container}>
        <div style={{ textAlign: "center", paddingTop: 100 }}>
          <p style={{ fontSize: 40 }}>🌭</p>
          <p style={{ color: "#888" }}>Cargando pedido...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={ts.container}>
        <div style={{ textAlign: "center", paddingTop: 100 }}>
          <p style={{ fontSize: 40 }}>❌</p>
          <p style={{ color: "#888", fontSize: 16 }}>Pedido no encontrado</p>
        </div>
      </div>
    );
  }

  const status = getStatus(order.status);
  const steps = ["received", "preparing", "on_the_way", "delivered"];
  const currentStep = steps.indexOf(order.status);

  return (
    <div style={ts.container}>
      {/* Header */}
      <div style={{ textAlign: "center", padding: "20px 0 10px" }}>
        <div style={{ fontSize: 32 }}>🌭</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: "4px 0" }}>Freakie Dogs</h1>
        <p style={{ fontSize: 13, color: "#888", margin: 0 }}>Seguimiento de pedido</p>
      </div>

      {/* Order ID */}
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 800, color: "#f97316" }}>{order.orderId}</span>
      </div>

      {/* Progress bar */}
      <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 20, padding: "0 16px" }}>
        {steps.map((step, i) => {
          const s = getStatus(step);
          const isActive = i <= currentStep;
          const isCurrent = i === currentStep;
          return (
            <div key={step} style={{ flex: 1, textAlign: "center" }}>
              <div style={{
                height: 6,
                borderRadius: 3,
                background: isActive ? s.color : "#333",
                marginBottom: 6,
                transition: "background 0.3s",
              }} />
              <div style={{
                fontSize: 18,
                opacity: isActive ? 1 : 0.3,
              }}>{s.icon}</div>
              <div style={{
                fontSize: 10,
                color: isCurrent ? s.color : "#666",
                fontWeight: isCurrent ? 700 : 400,
                marginTop: 2,
              }}>{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* Current status */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <span style={{ ...ds.statusBadge, background: status.color, fontSize: 14, padding: "6px 16px" }}>
          {status.icon} {status.label}
        </span>
      </div>

      {/* Map (only when on the way) */}
      {order.status === "on_the_way" && driverLocation && (
        <div style={{ marginBottom: 16 }}>
          <div id="tracking-map" style={{ width: "100%", height: 300, borderRadius: 12, border: "1px solid #333" }} />
          <p style={{ textAlign: "center", fontSize: 12, color: "#666", marginTop: 6 }}>
            🏍️ Tu motorista viene en camino · Actualización en tiempo real
          </p>
        </div>
      )}

      {order.status === "on_the_way" && !driverLocation && (
        <div style={{ textAlign: "center", padding: 20, background: "#111", borderRadius: 12, marginBottom: 16 }}>
          <p style={{ fontSize: 30 }}>🏍️</p>
          <p style={{ color: "#888", fontSize: 14 }}>Tu motorista está en camino</p>
          <p style={{ color: "#555", fontSize: 12 }}>El mapa aparecerá cuando el motorista active su GPS</p>
        </div>
      )}

      {order.status === "delivered" && (
        <div style={{ textAlign: "center", padding: 20, background: "#0a1a0a", borderRadius: 12, marginBottom: 16, border: "1px solid #1a3a1a" }}>
          <p style={{ fontSize: 40 }}>🎉</p>
          <p style={{ color: "#4ade80", fontSize: 16, fontWeight: 700 }}>¡Tu pedido ha sido entregado!</p>
          <p style={{ color: "#888", fontSize: 13 }}>Gracias por pedir en Freakie Dogs</p>
        </div>
      )}

      {/* Order details */}
      <div style={{ background: "#111", borderRadius: 12, padding: 16, border: "1px solid #222", marginBottom: 16 }}>
        <h3 style={{ color: "#999", fontSize: 14, margin: "0 0 10px" }}>📋 Tu pedido</h3>
        {(order.items || []).map((item, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#ccc", padding: "3px 0" }}>
            <span>{item.qty}x {item.name}</span>
            <span style={{ fontWeight: 700 }}>${(item.price * item.qty).toFixed(2)}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #333", marginTop: 8, paddingTop: 8 }}>
          <span style={{ fontWeight: 800, color: "#fff" }}>Total</span>
          <span style={{ fontWeight: 800, color: "#f97316" }}>${order.total?.toFixed(2)}</span>
        </div>
      </div>

      {/* Driver info */}
      {order.driverName && (
        <div style={{ background: "#111", borderRadius: 12, padding: 16, border: "1px solid #222", marginBottom: 16 }}>
          <h3 style={{ color: "#999", fontSize: 14, margin: "0 0 8px" }}>🏍️ Tu motorista</h3>
          <p style={{ color: "#fff", fontSize: 15, margin: "2px 0", fontWeight: 600 }}>{order.driverName}</p>
          <a href={`tel:${order.driverPhone}`} style={{ color: "#60a5fa", fontSize: 14, textDecoration: "none" }}>
            📱 Llamar: {order.driverPhone}
          </a>
        </div>
      )}

      <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12, color: "#444" }}>
        Freakie Dogs © 2026 · Ese extra extraordinario 🌭🔥
      </div>
    </div>
  );
}

// Tracking styles
const ts = {
  container: {
    maxWidth: 500,
    margin: "0 auto",
    padding: 16,
    background: "#0a0a0a",
    minHeight: "100vh",
    color: "#fff",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
};

// Driver styles
const ds = {
  loginContainer: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0a0a0a",
    padding: 20,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  loginCard: {
    background: "#111",
    borderRadius: 16,
    padding: 32,
    width: "100%",
    maxWidth: 360,
    border: "1px solid #222",
  },
  loginTitle: {
    textAlign: "center",
    fontSize: 24,
    fontWeight: 800,
    color: "#fff",
    margin: "0 0 4px",
  },
  loginSub: {
    textAlign: "center",
    fontSize: 14,
    color: "#888",
    margin: "0 0 24px",
  },
  container: {
    maxWidth: 600,
    margin: "0 auto",
    padding: 16,
    background: "#0a0a0a",
    minHeight: "100vh",
    color: "#fff",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  logoText: {
    fontSize: 18,
    fontWeight: 800,
    color: "#fff",
    margin: 0,
  },
  input: {
    width: "100%",
    padding: "14px",
    background: "#1a1a1a",
    border: "1px solid #333",
    borderRadius: 8,
    color: "#fff",
    fontSize: 18,
    marginBottom: 12,
    boxSizing: "border-box",
    outline: "none",
    textAlign: "center",
    letterSpacing: 4,
    fontFamily: "monospace",
  },
  btnPrimary: {
    width: "100%",
    padding: "14px",
    background: "#f97316",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
  btnSmall: {
    padding: "8px 14px",
    background: "#222",
    color: "#ccc",
    border: "1px solid #333",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  orderCard: {
    background: "#111",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    border: "2px solid #222",
  },
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 10px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
    color: "#fff",
  },
  btnDelivery: {
    width: "100%",
    padding: "12px",
    background: "#1a1a4a",
    color: "#818cf8",
    border: "2px solid #4f46e5",
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  btnComplete: {
    width: "100%",
    padding: "12px",
    background: "#0a2a0a",
    color: "#4ade80",
    border: "2px solid #16a34a",
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  emptyState: {
    textAlign: "center",
    padding: "40px 20px",
    color: "#666",
    fontSize: 15,
  },
};

// ═══════════════════════════════════════════════
// ADMIN PANEL
// ═══════════════════════════════════════════════
function AdminPanel() {
  const [screen, setScreen] = useState("login");
  const [adminCode, setAdminCode] = useState("");
  const [orders, setOrders] = useState({});
  const [drivers, setDrivers] = useState({});
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [filter, setFilter] = useState("all");
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [newDriverName, setNewDriverName] = useState("");
  const [newDriverPhone, setNewDriverPhone] = useState("");
  const pollRef = useRef(null);

  // Poll Firebase every 5 seconds
  const fetchData = useCallback(async () => {
    try {
      const [ordersData, driversData] = await Promise.all([
        fbGet("orders"),
        fbGet("drivers"),
      ]);
      setOrders(ordersData || {});
      setDrivers(driversData || {});
    } catch (e) {
      console.error("Firebase fetch error:", e);
    }
  }, []);

  useEffect(() => {
    if (screen !== "login") {
      fetchData();
      pollRef.current = setInterval(fetchData, 5000);
      return () => clearInterval(pollRef.current);
    }
  }, [screen, fetchData]);

  const handleLogin = () => {
    if (adminCode === "freakie2026" || adminCode === "admin") {
      setScreen("dashboard");
    }
  };

  const addDriver = async () => {
    if (!newDriverName.trim()) return;
    const code = "M" + Math.random().toString(36).substring(2, 6).toUpperCase();
    await fbPush("drivers", {
      name: newDriverName.trim(),
      phone: newDriverPhone.trim(),
      code,
      active: true,
      createdAt: Date.now(),
    });
    setNewDriverName("");
    setNewDriverPhone("");
    setShowAddDriver(false);
    fetchData();
  };

  const deleteDriver = async (driverId) => {
    if (!window.confirm("¿Eliminar este motorista?")) return;
    await fbSet(`drivers/${driverId}`, null);
    fetchData();
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    await fbUpdate(`orders/${orderId}`, {
      status: newStatus,
      [`statusUpdates/${newStatus}`]: Date.now(),
    });
    // Update local state too
    setOrders(prev => ({
      ...prev,
      [orderId]: { ...prev[orderId], status: newStatus }
    }));
    if (selectedOrder && selectedOrder[0] === orderId) {
      setSelectedOrder([orderId, { ...selectedOrder[1], status: newStatus }]);
    }
    fetchData();
  };

  const assignDriver = async (orderId, driverId) => {
    const driver = drivers[driverId];
    await fbUpdate(`orders/${orderId}`, {
      driverId: driverId || null,
      driverName: driver?.name || "",
      driverPhone: driver?.phone || "",
    });
    fetchData();
  };

  const createTestOrder = async () => {
    const testOrder = {
      orderId: "FD-" + Math.random().toString().substring(2, 10),
      customer: {
        name: "Cliente de Prueba",
        phone: "70001234",
      },
      items: [
        { name: "Freakie Burger", qty: 2, price: 7.99 },
        { name: "Combo Individual", qty: 1, price: 3.99 },
      ],
      total: 19.97,
      delivery: {
        type: "delivery",
        address: "5 Calle Ote. 7, Santa Tecla",
        houseNum: "Casa 15",
        city: "Santa Tecla",
        reference: "Cerca del parque",
        coords: { lat: 13.6783, lng: -89.2808 },
      },
      payment: "cash",
      status: "received",
      statusUpdates: { received: Date.now() },
      createdAt: Date.now(),
      note: "",
    };
    const result = await fbPush("orders", testOrder);
    console.log("Test order created:", result);
    await fetchData();
  };

  // Filter orders
  const ordersList = Object.entries(orders).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
  const filteredOrders = filter === "all"
    ? ordersList.filter(([, o]) => o.status !== "delivered" && o.status !== "cancelled")
    : ordersList.filter(([, o]) => o.status === filter);

  const orderCounts = {
    all: ordersList.filter(([, o]) => o.status !== "delivered" && o.status !== "cancelled").length,
    received: ordersList.filter(([, o]) => o.status === "received").length,
    preparing: ordersList.filter(([, o]) => o.status === "preparing").length,
    on_the_way: ordersList.filter(([, o]) => o.status === "on_the_way").length,
    delivered: ordersList.filter(([, o]) => o.status === "delivered").length,
  };

  // ── LOGIN ──
  if (screen === "login") {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginCard}>
          <div style={{ fontSize: 48, textAlign: "center", marginBottom: 8 }}>🌭</div>
          <h1 style={styles.loginTitle}>Freakie Dogs</h1>
          <p style={styles.loginSub}>Panel de Administración</p>
          <input
            style={styles.input}
            type="password"
            placeholder="Código de acceso"
            value={adminCode}
            onChange={e => setAdminCode(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
          />
          <button style={styles.btnPrimary} onClick={handleLogin}>
            Ingresar
          </button>
        </div>
      </div>
    );
  }

  // ── ORDER DETAIL ──
  if (screen === "order_detail" && selectedOrder) {
    const [orderId, order] = selectedOrder;
    const status = getStatus(order.status);
    return (
      <div style={styles.container}>
        <div style={styles.topBar}>
          <button style={styles.backBtn} onClick={() => { setSelectedOrder(null); setScreen("dashboard"); }}>← Volver</button>
          <h2 style={styles.topTitle}>Pedido {order.orderId}</h2>
        </div>

        <div style={styles.detailCard}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ ...styles.statusBadge, background: status.color }}>{status.icon} {status.label}</span>
            <span style={{ fontSize: 13, color: "#888" }}>
              {new Date(order.createdAt).toLocaleString("es-SV")}
            </span>
          </div>

          {/* Status buttons */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {STATUSES.filter(s => s.id !== "cancelled").map(s => (
              <button
                key={s.id}
                onClick={() => updateOrderStatus(orderId, s.id)}
                style={{
                  ...styles.statusBtn,
                  background: order.status === s.id ? s.color : "transparent",
                  color: order.status === s.id ? "#fff" : s.color,
                  border: `2px solid ${s.color}`,
                }}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>

          {/* Assign driver */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>🏍️ Motorista asignado</h3>
            <select
              style={styles.select}
              value={order.driverId || ""}
              onChange={e => assignDriver(orderId, e.target.value)}
            >
              <option value="">— Sin asignar —</option>
              {Object.entries(drivers).map(([id, d]) => (
                <option key={id} value={id}>{d.name} ({d.code})</option>
              ))}
            </select>
            {order.driverName && (
              <p style={{ fontSize: 14, color: "#10b981", marginTop: 8 }}>
                ✅ {order.driverName} — {order.driverPhone}
              </p>
            )}
          </div>

          {/* Customer */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>👤 Cliente</h3>
            <p style={styles.detailText}>{order.customer?.name}</p>
            <p style={styles.detailText}>📱 {order.customer?.phone}</p>
          </div>

          {/* Items */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>🛒 Productos</h3>
            {(order.items || []).map((item, i) => (
              <div key={i} style={styles.itemRow}>
                <span>{item.qty}x {item.name}</span>
                <span style={{ fontWeight: 700 }}>${(item.price * item.qty).toFixed(2)}</span>
              </div>
            ))}
            <div style={{ ...styles.itemRow, borderTop: "2px solid #333", paddingTop: 8, marginTop: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>Total</span>
              <span style={{ fontWeight: 800, fontSize: 16, color: "#f97316" }}>${order.total?.toFixed(2)}</span>
            </div>
          </div>

          {/* Delivery */}
          {order.delivery?.type === "delivery" && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>📍 Entrega</h3>
              <p style={styles.detailText}>{order.delivery.address}</p>
              <p style={styles.detailText}>🏠 {order.delivery.houseNum}</p>
              <p style={styles.detailText}>🏙️ {order.delivery.city}</p>
              <p style={styles.detailText}>📌 {order.delivery.reference}</p>
              {order.delivery.coords && (
                <a
                  href={`https://www.google.com/maps?q=${order.delivery.coords.lat},${order.delivery.coords.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.mapLink}
                >
                  🗺️ Ver en Google Maps
                </a>
              )}
            </div>
          )}

          {/* Payment */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>💳 Pago</h3>
            <p style={styles.detailText}>
              {order.payment === "cash" ? "💵 Efectivo" : order.payment === "transfer" ? "🏦 Transferencia" : "💳 Tarjeta"}
            </p>
          </div>

          {order.note && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>📝 Nota</h3>
              <p style={styles.detailText}>{order.note}</p>
            </div>
          )}

          {/* Cancel */}
          {order.status !== "cancelled" && order.status !== "delivered" && (
            <button
              style={{ ...styles.btnDanger, marginTop: 16 }}
              onClick={() => {
                if (window.confirm("¿Cancelar este pedido?")) {
                  updateOrderStatus(orderId, "cancelled");
                  setScreen("dashboard");
                }
              }}
            >
              ❌ Cancelar pedido
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── DRIVERS ──
  if (screen === "drivers") {
    return (
      <div style={styles.container}>
        <div style={styles.topBar}>
          <button style={styles.backBtn} onClick={() => setScreen("dashboard")}>← Volver</button>
          <h2 style={styles.topTitle}>Motoristas</h2>
          <button style={styles.btnSmall} onClick={() => setShowAddDriver(true)}>+ Agregar</button>
        </div>

        {showAddDriver && (
          <div style={styles.detailCard}>
            <h3 style={styles.sectionTitle}>Nuevo motorista</h3>
            <input style={styles.input} placeholder="Nombre completo" value={newDriverName} onChange={e => setNewDriverName(e.target.value)} />
            <input style={styles.input} placeholder="Teléfono" value={newDriverPhone} onChange={e => setNewDriverPhone(e.target.value)} />
            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.btnPrimary} onClick={addDriver}>Guardar</button>
              <button style={styles.btnSecondary} onClick={() => setShowAddDriver(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {Object.entries(drivers).length === 0 ? (
          <div style={styles.emptyState}>
            <p style={{ fontSize: 40 }}>🏍️</p>
            <p>No hay motoristas registrados</p>
            <button style={styles.btnPrimary} onClick={() => setShowAddDriver(true)}>Agregar motorista</button>
          </div>
        ) : (
          Object.entries(drivers).map(([id, driver]) => (
            <div key={id} style={styles.driverCard}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>{driver.name}</div>
                <div style={{ fontSize: 13, color: "#888" }}>📱 {driver.phone || "—"}</div>
                <div style={{ fontSize: 13, color: "#f59e0b", fontFamily: "monospace", marginTop: 4 }}>
                  Código: {driver.code}
                </div>
              </div>
              <button style={styles.btnDangerSmall} onClick={() => deleteDriver(id)}>🗑️</button>
            </div>
          ))
        )}
      </div>
    );
  }

  // ── DASHBOARD ──
  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <div>
          <h1 style={styles.logoText}>🌭 Freakie Dogs</h1>
          <p style={{ fontSize: 13, color: "#888", margin: 0 }}>Panel Admin</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={styles.btnSmall} onClick={() => setScreen("drivers")}>
            🏍️ Motoristas ({Object.keys(drivers).length})
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={styles.statsRow}>
        {[
          { label: "Activos", count: orderCounts.all, color: "#f97316", f: "all" },
          { label: "Recibidos", count: orderCounts.received, color: "#f59e0b", f: "received" },
          { label: "Preparando", count: orderCounts.preparing, color: "#3b82f6", f: "preparing" },
          { label: "En camino", count: orderCounts.on_the_way, color: "#8b5cf6", f: "on_the_way" },
          { label: "Entregados", count: orderCounts.delivered, color: "#10b981", f: "delivered" },
        ].map(s => (
          <button
            key={s.f}
            onClick={() => setFilter(s.f)}
            style={{
              ...styles.statCard,
              borderColor: filter === s.f ? s.color : "#333",
              background: filter === s.f ? s.color + "15" : "#111",
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{s.label}</div>
          </button>
        ))}
      </div>

      {/* Test order button */}
      <button style={{ ...styles.btnSecondary, width: "100%", marginBottom: 16 }} onClick={createTestOrder}>
        🧪 Crear pedido de prueba
      </button>

      {/* Orders */}
      {filteredOrders.length === 0 ? (
        <div style={styles.emptyState}>
          <p style={{ fontSize: 40 }}>📭</p>
          <p>No hay pedidos {filter !== "all" ? `con estado "${getStatus(filter).label}"` : "activos"}</p>
        </div>
      ) : (
        filteredOrders.map(([id, order]) => {
          const status = getStatus(order.status);
          return (
            <div
              key={id}
              style={styles.orderCard}
              onClick={() => { setSelectedOrder([id, order]); setScreen("order_detail"); }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 15, fontFamily: "monospace", color: "#fff" }}>{order.orderId}</span>
                <span style={{ ...styles.statusBadge, background: status.color }}>{status.icon} {status.label}</span>
              </div>
              <div style={{ fontSize: 14, color: "#ccc", marginBottom: 4 }}>
                👤 {order.customer?.name} — 📱 {order.customer?.phone}
              </div>
              <div style={{ fontSize: 13, color: "#888", marginBottom: 4 }}>
                {(order.items || []).map(i => `${i.qty}x ${i.name}`).join(", ")}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, color: "#f97316", fontSize: 16 }}>${order.total?.toFixed(2)}</span>
                <span style={{ fontSize: 12, color: "#666" }}>
                  {order.driverName ? `🏍️ ${order.driverName}` : "Sin motorista"}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>
                {new Date(order.createdAt).toLocaleString("es-SV")}
              </div>
            </div>
          );
        })
      )}

      <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12, color: "#444" }}>
        Actualizando cada 5 segundos · Freakie Dogs © 2026
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════
const styles = {
  loginContainer: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0a0a0a",
    padding: 20,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  loginCard: {
    background: "#111",
    borderRadius: 16,
    padding: 32,
    width: "100%",
    maxWidth: 360,
    border: "1px solid #222",
  },
  loginTitle: {
    textAlign: "center",
    fontSize: 24,
    fontWeight: 800,
    color: "#fff",
    margin: "0 0 4px",
  },
  loginSub: {
    textAlign: "center",
    fontSize: 14,
    color: "#888",
    margin: "0 0 24px",
  },
  container: {
    maxWidth: 600,
    margin: "0 auto",
    padding: 16,
    background: "#0a0a0a",
    minHeight: "100vh",
    color: "#fff",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    flexWrap: "wrap",
    gap: 8,
  },
  topTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#fff",
    margin: 0,
    flex: 1,
  },
  logoText: {
    fontSize: 20,
    fontWeight: 800,
    color: "#fff",
    margin: 0,
  },
  backBtn: {
    background: "none",
    border: "none",
    color: "#60a5fa",
    fontSize: 15,
    cursor: "pointer",
    padding: "4px 0",
    fontWeight: 600,
  },
  statsRow: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
    overflowX: "auto",
    paddingBottom: 4,
  },
  statCard: {
    flex: "1 0 auto",
    minWidth: 80,
    padding: "12px 10px",
    borderRadius: 10,
    border: "2px solid #333",
    textAlign: "center",
    cursor: "pointer",
    background: "#111",
  },
  orderCard: {
    background: "#111",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    border: "1px solid #222",
    cursor: "pointer",
    transition: "border-color 0.2s",
  },
  detailCard: {
    background: "#111",
    borderRadius: 12,
    padding: 20,
    border: "1px solid #222",
    marginBottom: 16,
  },
  driverCard: {
    background: "#111",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    border: "1px solid #222",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 10px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
    color: "#fff",
  },
  statusBtn: {
    padding: "8px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#999",
    marginBottom: 8,
    margin: "0 0 8px",
  },
  detailText: {
    fontSize: 14,
    color: "#ccc",
    margin: "4px 0",
  },
  itemRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 14,
    color: "#ccc",
    padding: "4px 0",
  },
  mapLink: {
    display: "inline-block",
    marginTop: 8,
    padding: "8px 16px",
    background: "#1a1a2e",
    borderRadius: 8,
    color: "#60a5fa",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 600,
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    background: "#1a1a1a",
    border: "1px solid #333",
    borderRadius: 8,
    color: "#fff",
    fontSize: 14,
    marginBottom: 12,
    boxSizing: "border-box",
    outline: "none",
  },
  select: {
    width: "100%",
    padding: "10px 14px",
    background: "#1a1a1a",
    border: "1px solid #333",
    borderRadius: 8,
    color: "#fff",
    fontSize: 14,
  },
  btnPrimary: {
    width: "100%",
    padding: "12px",
    background: "#f97316",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  btnSecondary: {
    padding: "10px 16px",
    background: "#222",
    color: "#ccc",
    border: "1px solid #333",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnSmall: {
    padding: "8px 14px",
    background: "#222",
    color: "#ccc",
    border: "1px solid #333",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  btnDanger: {
    width: "100%",
    padding: "12px",
    background: "#7f1d1d",
    color: "#fca5a5",
    border: "1px solid #991b1b",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnDangerSmall: {
    padding: "8px 12px",
    background: "#7f1d1d",
    color: "#fca5a5",
    border: "1px solid #991b1b",
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer",
  },
  emptyState: {
    textAlign: "center",
    padding: "40px 20px",
    color: "#666",
    fontSize: 15,
  },
};
