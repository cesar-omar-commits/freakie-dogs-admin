import React, { useState, useEffect, useCallback, useRef } from "react";

// ═══════════════════════════════════════════════
// FIREBASE
// ═══════════════════════════════════════════════
const FB = "https://freakie-dogs-default-rtdb.firebaseio.com";
const STORAGE_BUCKET = "freakie-dogs.firebasestorage.app";

async function fbGet(p) { return (await fetch(`${FB}/${p}.json`)).json(); }
async function fbSet(p, d) { await fetch(`${FB}/${p}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }); }
async function fbUpdate(p, d) { await fetch(`${FB}/${p}.json`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }); }
async function fbPush(p, d) { return (await fetch(`${FB}/${p}.json`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) })).json(); }

// Upload a file to Firebase Storage and return its public URL
async function fbStorageUpload(file, path) {
  const url = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?name=${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const data = await res.json();
  // Return the download URL
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${data.downloadTokens}`;
}

// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════
const BRANCHES = [
  { id: "venecia", name: "Venecia", erpId: "f022554d-88b9-4ba5-aba5-8bbd0fb3f3ec", erpName: "Paseo Venecia", lat: 13.716623907412574, lng: -89.14466780166137 },
  { id: "lourdes", name: "Lourdes", erpId: "e712df8e-344c-4fad-94a9-fa06106d0f71", erpName: "Grand Plaza Lourdes", lat: 13.733201107267726, lng: -89.3603926936565 },
  { id: "plaza_mundo", name: "Plaza Mundo Soyapango", erpId: "04bcc11a-affa-44b4-9fec-b90d00639cf3", erpName: "Plaza Mundo Soyapango", lat: 13.698308350787157, lng: -89.15233743690021 },
  { id: "usulutan", name: "Usulután", erpId: "1382bdc6-4349-43af-86e9-1989b9b529de", erpName: "Plaza Mundo Usulután", lat: 13.343735833986724, lng: -88.46546425034532 },
  { id: "santa_tecla", name: "Santa Tecla", erpId: "8ffb29ec-3d58-4ae1-b0d4-bcd12202456e", erpName: "Plaza Cafetalón", lat: 13.676615992236819, lng: -89.28360413762667 },
];

// Algoritmo de asignación automática — constantes operativas
const AUTO_ASSIGN = {
  RADIO_SUCURSAL_KM: 0.5,          // 500m = "en sucursal"
  VELOCIDAD_PROMEDIO_KMH: 30,      // para estimar tiempos de ruta
  MAX_PEDIDOS_POR_DRIVER: 3,
  UMBRAL_INDIVIDUAL_USD: 100,      // pedidos > $100 van individuales
  MAX_DIST_AGRUPACION_KM: 2,       // entre clientes consecutivos
  MAX_DIFF_TIEMPO_AGRUPACION_MIN: 15,
  MAX_ESPERA_COCINA_MIN: 5,        // no esperar más de 5 min por cocina
  MAX_TIEMPO_POST_COCINA_MIN: 40,  // cocina → cliente no > 40 min
  GPS_EXPIRE_MS: 120000,           // GPS de más de 2 min = offline
};

// Supabase (ERP Freakie Dogs) — para sincronizar pedidos
const SUPABASE_URL = "https://btboxlwfqcbrdfrlnwln.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Ym94bHdmcWNicmRmcmxud2xuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NjcyMzQsImV4cCI6MjA4OTU0MzIzNH0.NpBQZgxbajgOVvw3FOwIUiOkgmh7rEuPQMRi0ZcFKe4";

// Map our status -> ERP estado
function mapStatusToErp(status) {
  switch (status) {
    case "new": return "recibida";
    case "assigned": return "asignada";
    case "preparing": return "preparando";
    case "ready": return "lista";
    case "on_the_way": return "en_camino";
    case "delivered": return "entregada";
    case "cancelled": return "cancelada";
    default: return "recibida";
  }
}

// Update an order in Supabase ERP (by numero_orden which is our orderId like FD-xxxxx)
async function supabaseUpdateOrder(orderId, updates) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/delivery_clientes?numero_orden=eq.${encodeURIComponent(orderId)}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      console.error("Supabase update failed:", res.status, await res.text());
    }
  } catch (e) {
    console.error("Supabase update error:", e);
  }
}

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
  if (existing && Object.keys(existing).length > 6) {
    // Make sure menu editor and stats exist
    const updates = {};
    if (!existing.menu_editor) updates.menu_editor = { code: "MENU01", role: "menu_editor", name: "Editor de Menú", branch: null, active: true };
    if (!existing.stats_user) updates.stats_user = { code: "STATS01", role: "stats", name: "Analytics", branch: null, active: true };
    if (Object.keys(updates).length > 0) await fbUpdate("users", updates);
    return;
  }

  const users = {
    // Admin
    admin1: { code: "ADMIN01", role: "admin", name: "Administrador General", branch: null, active: true },
    // Menu Editor
    menu_editor: { code: "MENU01", role: "menu_editor", name: "Editor de Menú", branch: null, active: true },
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
// ALGORITMO DE ASIGNACIÓN AUTOMÁTICA DE MOTORISTAS
// ═══════════════════════════════════════════════

// Haversine: distancia en km entre dos puntos lat/lng
function haversineKm(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
  const R = 6371; // km
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Tiempo en minutos para recorrer X km a la velocidad promedio
function kmToMinutes(km) {
  return (km / AUTO_ASSIGN.VELOCIDAD_PROMEDIO_KMH) * 60;
}

// Calcular el estado derivado de un motorista según pedidos activos y GPS
function calcDriverState(driverId, driver, orders, driversLoc) {
  const branch = BRANCHES.find((b) => b.id === driver.branch);
  if (!branch) return { state: "offline", distToSucursal: Infinity };

  const loc = driversLoc[driverId];
  const gpsAge = loc ? Date.now() - (loc.timestamp || 0) : Infinity;
  const gpsValid = loc && gpsAge < AUTO_ASSIGN.GPS_EXPIRE_MS;

  // Pedidos activos del motorista (asignados pero no entregados/cancelados)
  const activeOrders = Object.entries(orders).filter(
    ([, o]) =>
      o.driverUserId === driverId &&
      !["delivered", "cancelled"].includes(o.status)
  );

  const distToSucursal = gpsValid
    ? haversineKm(loc.lat, loc.lng, branch.lat, branch.lng)
    : Infinity;

  // Si no tiene pedidos activos y está en sucursal (radio 500m) → disponible
  if (activeOrders.length === 0) {
    if (!gpsValid) return { state: "offline", distToSucursal, activeOrders };
    if (distToSucursal <= AUTO_ASSIGN.RADIO_SUCURSAL_KM) {
      return { state: "disponible_en_sucursal", distToSucursal, activeOrders };
    }
    // Sin pedidos pero lejos de la sucursal → regresando
    return { state: "regresando_sucursal", distToSucursal, activeOrders };
  }

  // Con pedidos activos → en ruta
  return { state: "en_ruta_entrega", distToSucursal, activeOrders };
}

// Obtener lat/lng de un pedido (del cliente)
function getOrderCoords(order) {
  return {
    lat: order?.delivery?.coords?.lat ?? null,
    lng: order?.delivery?.coords?.lng ?? null,
  };
}

// ¿Se puede agregar este pedido nuevo a la ruta actual del motorista?
function puedeAgrupar(driverState, driver, newOrder, orders, driversLoc) {
  if ((newOrder.total || 0) > AUTO_ASSIGN.UMBRAL_INDIVIDUAL_USD) return false;

  const currentOrders = driverState.activeOrders || [];
  if (currentOrders.length >= AUTO_ASSIGN.MAX_PEDIDOS_POR_DRIVER) return false;

  const newCoords = getOrderCoords(newOrder);
  if (newCoords.lat == null) return false;

  // Si alguno de los pedidos actuales está en "on_the_way" (ya recogido) no se puede agregar
  const alreadyPickedUp = currentOrders.some(([, o]) => o.status === "on_the_way");
  if (alreadyPickedUp) return false;

  // Distancia entre cliente nuevo y cada cliente de la ruta: todos deben estar ≤ 2 km
  for (const [, o] of currentOrders) {
    const c = getOrderCoords(o);
    if (c.lat == null) return false;
    const d = haversineKm(c.lat, c.lng, newCoords.lat, newCoords.lng);
    if (d > AUTO_ASSIGN.MAX_DIST_AGRUPACION_KM) return false;
  }

  // Ventana temporal: diferencia entre el pedido más temprano y más tardío ≤ 15 min
  const times = currentOrders.map(([, o]) => o.createdAt || 0).concat([newOrder.createdAt || Date.now()]);
  const diffMin = (Math.max(...times) - Math.min(...times)) / 60000;
  if (diffMin > AUTO_ASSIGN.MAX_DIFF_TIEMPO_AGRUPACION_MIN) return false;

  // Si la ruta ya está lista y agregar este pedido obligaría a esperar >5 min por cocina → no
  const allReady = currentOrders.every(([, o]) => o.status === "ready");
  if (allReady) {
    // Tiempo estimado para que el nuevo pedido esté listo
    const prepMin = newOrder.prepMinutes || 0;
    if (prepMin > AUTO_ASSIGN.MAX_ESPERA_COCINA_MIN) return false;
  }

  // Validar tiempo máximo post-cocina (40 min)
  // Estimación simple: tiempo hasta salir + tiempo de ruta hasta el último cliente
  const branch = BRANCHES.find((b) => b.id === driver.branch);
  if (branch) {
    const allCoords = [...currentOrders.map(([, o]) => getOrderCoords(o)), newCoords];
    // Ruta: sucursal → cliente1 → cliente2 → ... → último
    let totalKm = 0;
    let prev = { lat: branch.lat, lng: branch.lng };
    for (const c of allCoords) {
      if (c.lat == null) continue;
      totalKm += haversineKm(prev.lat, prev.lng, c.lat, c.lng);
      prev = c;
    }
    const routeMinutes = kmToMinutes(totalKm);
    if (routeMinutes > AUTO_ASSIGN.MAX_TIEMPO_POST_COCINA_MIN) return false;
  }

  return true;
}

// Tiempo estimado de regreso a sucursal (en minutos)
function tiempoRegresoEstimado(driverState, driver, orders, driversLoc) {
  const loc = driversLoc[driver.id || driver._id];
  const branch = BRANCHES.find((b) => b.id === driver.branch);
  if (!branch) return Infinity;

  const activeOrders = driverState.activeOrders || [];
  if (activeOrders.length === 0) {
    // Sin pedidos activos → distancia directa de su GPS a sucursal
    if (!loc) return Infinity;
    return kmToMinutes(haversineKm(loc.lat, loc.lng, branch.lat, branch.lng));
  }

  // Con pedidos: tiempo estimado hasta entregar todos + regresar a sucursal
  const startLat = loc?.lat ?? branch.lat;
  const startLng = loc?.lng ?? branch.lng;
  let totalKm = 0;
  let prev = { lat: startLat, lng: startLng };
  for (const [, o] of activeOrders) {
    const c = getOrderCoords(o);
    if (c.lat == null) continue;
    totalKm += haversineKm(prev.lat, prev.lng, c.lat, c.lng);
    prev = c;
  }
  // Regreso a sucursal
  totalKm += haversineKm(prev.lat, prev.lng, branch.lat, branch.lng);
  return kmToMinutes(totalKm);
}

// Función principal de asignación automática
// Devuelve: { driverId, reason } o null si no se pudo asignar
function asignarPedidoAutomatico(orderId, orders, users, driversLoc) {
  const order = orders[orderId];
  if (!order || !order.branch) return null;

  // Motoristas activos de esta sucursal
  const branchDrivers = Object.entries(users)
    .filter(([, u]) => u.role === "driver" && u.branch === order.branch && u.active)
    .map(([id, u]) => ({ id, ...u, _state: calcDriverState(id, u, orders, driversLoc) }));

  const libresEnSucursal = branchDrivers.filter(
    (d) => d._state.state === "disponible_en_sucursal"
  );

  // REGLA 1: Pedido > $70 → individual obligatorio
  if ((order.total || 0) > AUTO_ASSIGN.UMBRAL_INDIVIDUAL_USD) {
    if (libresEnSucursal.length > 0) {
      // El más cercano a la sucursal (por si acaso)
      libresEnSucursal.sort((a, b) => a._state.distToSucursal - b._state.distToSucursal);
      return { driverId: libresEnSucursal[0].id, reason: "individual_grande_libre" };
    }
    // Si no hay libre, esperar al que regresa antes
    const regresando = branchDrivers.filter((d) => d._state.state === "regresando_sucursal");
    if (regresando.length > 0) {
      regresando.sort(
        (a, b) =>
          tiempoRegresoEstimado(a._state, a, orders, driversLoc) -
          tiempoRegresoEstimado(b._state, b, orders, driversLoc)
      );
      return { driverId: regresando[0].id, reason: "individual_grande_reservado" };
    }
    return null;
  }

  // REGLA 2: Motorista libre en sucursal → asignación individual directa
  if (libresEnSucursal.length > 0) {
    libresEnSucursal.sort((a, b) => a._state.distToSucursal - b._state.distToSucursal);
    return { driverId: libresEnSucursal[0].id, reason: "libre_en_sucursal" };
  }

  // REGLA 3: Evaluar agrupación
  const candidatosAgrupacion = branchDrivers.filter((d) =>
    puedeAgrupar(d._state, d, order, orders, driversLoc)
  );

  if (candidatosAgrupacion.length > 0) {
    // Elegir el que tiene menos pedidos actuales (para repartir mejor)
    candidatosAgrupacion.sort((a, b) => {
      const aCount = a._state.activeOrders.length;
      const bCount = b._state.activeOrders.length;
      if (aCount !== bCount) return aCount - bCount;
      return a._state.distToSucursal - b._state.distToSucursal;
    });
    return { driverId: candidatosAgrupacion[0].id, reason: "agrupacion" };
  }

  // REGLA 4: Reservar al motorista que regresa en menor tiempo
  const regresando = branchDrivers.filter(
    (d) => d._state.state === "regresando_sucursal" || d._state.state === "en_ruta_entrega"
  );
  if (regresando.length > 0) {
    regresando.sort(
      (a, b) =>
        tiempoRegresoEstimado(a._state, a, orders, driversLoc) -
        tiempoRegresoEstimado(b._state, b, orders, driversLoc)
    );
    // Solo reservar si no excede el límite de 3 pedidos
    const best = regresando.find((d) => d._state.activeOrders.length < AUTO_ASSIGN.MAX_PEDIDOS_POR_DRIVER);
    if (best) return { driverId: best.id, reason: "reservado" };
  }

  return null;
}

// ═══════════════════════════════════════════════
// APP ROUTER
// ═══════════════════════════════════════════════
export default function App() {
  const path = window.location.pathname;
  if (path.startsWith("/track/")) return <TrackingView orderId={path.split("/track/")[1]} />;
  if (path.startsWith("/migrate")) return <MigrationPage />;
  return <MainApp />;
}

// ═══════════════════════════════════════════════
// MIGRATION PAGE — One-time migration of menu data to Firebase
// ═══════════════════════════════════════════════
function MigrationPage() {
  const [status, setStatus] = useState("idle"); // idle | running | done | error
  const [log, setLog] = useState([]);

  const addLog = (msg) => setLog(prev => [...prev, msg]);

  const migrate = async () => {
    setStatus("running");
    setLog([]);

    try {
      // Check if already migrated
      addLog("🔍 Verificando si ya hay datos en Firebase...");
      const existing = await fbGet("menu/products");
      if (existing && Object.keys(existing).length > 0) {
        if (!window.confirm("Ya hay productos en Firebase. ¿Seguro que querés sobrescribir todo?")) {
          addLog("❌ Migración cancelada");
          setStatus("idle");
          return;
        }
      }

      // Store config
      addLog("📝 Guardando configuración del negocio...");
      const STORE_DATA = {
        name: "Freakie Dogs",
        tagline: "Ese extra extraordinario 🌭🔥🌭",
        address: "7 Calle Oriente, Santa Tecla, El Salvador",
        hours: "10:00 - 21:00",
        phone: "50360222080",
        currency: "USD",
        minOrder: 0,
        isOpen: true,
      };
      await fbSet("menu/store", STORE_DATA);

      // Categories
      addLog("📂 Guardando categorías...");
      const CATEGORIES_DATA = {
        combos: { id: "combos", name: "COMBOS 🔥", emoji: "🔥", order: 1 },
        burgers: { id: "burgers", name: "FREAKIE BURGER 🍔", emoji: "🍔", order: 2 },
        hotdogs: { id: "hotdogs", name: "HOT DOGS 🌭", emoji: "🌭", order: 3 },
        fries: { id: "fries", name: "PAPAS 🍟", emoji: "🍟", order: 4 },
        drinks: { id: "drinks", name: "BEBIDAS 🥤", emoji: "🥤", order: 5 },
        extras: { id: "extras", name: "EXTRAS ✨", emoji: "✨", order: 6 },
      };
      await fbSet("menu/categories", CATEGORIES_DATA);

      // Modifier templates
      addLog("⚙️ Guardando plantillas de modificadores...");
      const MOD_TEMPLATES = {
        burgerExtras: {
          name: "Extras",
          required: false,
          maxSelections: 7,
          options: [
            { id: "jalap", name: "Jalapeños 🌶️", price: 0.50 },
            { id: "bacon", name: "Tocino 🥓", price: 0.75 },
            { id: "peperon", name: "Peperroncinis 🌶️", price: 1.00 },
            { id: "mermtoc", name: "Mermelada de tocino 🥓🍯", price: 1.25 },
            { id: "carnequeso", name: "Carne y Queso extra 🧀", price: 1.50 },
            { id: "arosceb", name: "Aros de Cebolla 🧅", price: 1.00 },
            { id: "goldcheese", name: "Golden Cheese 🧀✨", price: 2.99 },
            { id: "sincomp", name: "Sin complementos", price: 0 },
          ],
        },
        salsasPapas: {
          name: "Salsas",
          required: true,
          maxSelections: 4,
          options: [
            { id: "ketchup", name: "Ketchup", price: 0 },
            { id: "mayo", name: "Mayonesa", price: 0 },
            { id: "cheddar", name: "Cheddar", price: 0 },
            { id: "bbq", name: "BBQ", price: 0 },
            { id: "ranch", name: "Ranch", price: 0 },
            { id: "buffalo", name: "Buffalo", price: 0 },
          ],
        },
        sodas: {
          name: "Bebida",
          required: true,
          maxSelections: 1,
          options: [
            { id: "coca", name: "Coca Cola", price: 0 },
            { id: "fanta", name: "Fanta", price: 0 },
            { id: "sprite", name: "Sprite", price: 0 },
            { id: "agua", name: "Agua", price: 0 },
          ],
        },
        hotdogSalsas: {
          name: "Salsas",
          required: true,
          maxSelections: 3,
          options: [
            { id: "ketchup", name: "Ketchup", price: 0 },
            { id: "mustard", name: "Mostaza", price: 0 },
            { id: "mayo", name: "Mayonesa", price: 0 },
            { id: "cheddar", name: "Cheddar", price: 0 },
          ],
        },
      };
      await fbSet("menu/modifierTemplates", MOD_TEMPLATES);

      // Products
      addLog("🍔 Guardando productos...");
      const PRODUCTS_DATA = {
        "burger-box": {
          id: "burger-box", name: "Burger Box",
          description: "Dos Smashburgers 🍔🍔, dos hot dogs con 8 complementos 🌭🌭 (uno lleva costra de queso 🧀), dos papas 🍟🍟, una orden de jalapeños 🌶️ y dos bebidas 🥤🥤",
          price: 19.50, image: "🍔📦", imageUrl: "", category: "combos", badge: "Más vendido", order: 1,
          modifierGroups: [
            { template: "burgerExtras", name: "Burger 1", id: "b1" },
            { template: "burgerExtras", name: "Burger 2", id: "b2" },
            { template: "salsasPapas", name: "Papas 1", id: "p1" },
            { template: "salsasPapas", name: "Papas 2", id: "p2" },
            { template: "sodas", name: "Soda 1", id: "s1" },
            { template: "sodas", name: "Soda 2", id: "s2" },
          ],
        },
        "freakie-duo": {
          id: "freakie-duo", name: "Freakie Burger Dúo",
          description: "Dos Smashburgers 🍔🍔 con papas 🍟, salsas y dos bebidas 🥤🥤. Perfecto para compartir.",
          price: 15.49, image: "🍔🍔", imageUrl: "", category: "combos", badge: "Popular", order: 2,
          modifierGroups: [
            { template: "burgerExtras", name: "Burger 1", id: "b1" },
            { template: "burgerExtras", name: "Burger 2", id: "b2" },
            { template: "salsasPapas", name: "Papas 1", id: "p1" },
            { template: "sodas", name: "Soda 1", id: "s1" },
            { template: "sodas", name: "Soda 2", id: "s2" },
          ],
        },
        "combo-big": {
          id: "combo-big", name: "ComBig",
          description: "El nuevo combo grande 🔥 Smashburger doble + hot dog + papas grandes + bebida. Todo lo que necesitás.",
          price: 21.99, image: "🍔🌭", imageUrl: "", category: "combos", badge: "Nuevo", order: 3,
          modifierGroups: [
            { template: "burgerExtras", name: "Extras Burger", id: "eb" },
            { template: "hotdogSalsas", name: "Salsas Hot Dog", id: "shd" },
            { template: "salsasPapas", name: "Salsas Papas", id: "sp" },
            { template: "sodas", name: "Bebida", id: "beb" },
          ],
        },
        "smash-single": {
          id: "smash-single", name: "Freakie Smashburger",
          description: "Nuestra clásica Smashburger con carne smash, queso americano, lechuga, tomate y salsas 🍔🔥",
          price: 5.99, image: "🍔", imageUrl: "", category: "burgers", order: 1,
          modifierGroups: [{ template: "burgerExtras", name: "Extras", id: "ext" }],
        },
        "smash-double": {
          id: "smash-double", name: "Freakie Smashburger Doble",
          description: "Doble carne smash, doble queso 🧀🧀 Para los que quieren más.",
          price: 8.49, image: "🍔🍔", imageUrl: "", category: "burgers", badge: "Popular", order: 2,
          modifierGroups: [{ template: "burgerExtras", name: "Extras", id: "ext" }],
        },
        "hotdog-classic": {
          id: "hotdog-classic", name: "Freakie Dog Clásico",
          description: "Hot dog con salchicha premium, salsas a tu gusto 🌭",
          price: 3.99, image: "🌭", imageUrl: "", category: "hotdogs", order: 1,
          modifierGroups: [{ template: "hotdogSalsas", name: "Salsas", id: "sal" }],
        },
        "hotdog-cheese": {
          id: "hotdog-cheese", name: "Freakie Dog con Costra de Queso",
          description: "Hot dog con costra de queso dorado crujiente 🌭🧀✨ El favorito de la casa.",
          price: 4.99, image: "🌭🧀", imageUrl: "", category: "hotdogs", badge: "Favorito", order: 2,
          modifierGroups: [
            { template: "hotdogSalsas", name: "Salsas", id: "sal" },
            { template: "burgerExtras", name: "Extras", id: "ext" },
          ],
        },
        "papas-reg": {
          id: "papas-reg", name: "Papas Freakie",
          description: "Papas fritas crujientes con tus salsas favoritas 🍟",
          price: 2.99, image: "🍟", imageUrl: "", category: "fries", order: 1,
          modifierGroups: [{ template: "salsasPapas", name: "Salsas", id: "sal" }],
        },
        "papas-loaded": {
          id: "papas-loaded", name: "Papas Loaded",
          description: "Papas fritas cargadas con queso cheddar, tocino y jalapeños 🍟🧀🥓",
          price: 5.49, image: "🍟🔥", imageUrl: "", category: "fries", badge: "Popular", order: 2,
          modifierGroups: [{ template: "salsasPapas", name: "Salsas extra", id: "sal" }],
        },
        "coca-cola": {
          id: "coca-cola", name: "Coca Cola", description: "Coca Cola bien fría 🥤",
          price: 1.25, image: "🥤", imageUrl: "", category: "drinks", order: 1, modifierGroups: [],
        },
        "fanta": {
          id: "fanta", name: "Fanta", description: "Fanta naranja 🍊",
          price: 1.25, image: "🍊", imageUrl: "", category: "drinks", order: 2, modifierGroups: [],
        },
        "agua": {
          id: "agua", name: "Agua", description: "Agua pura 💧",
          price: 1.00, image: "💧", imageUrl: "", category: "drinks", order: 3, modifierGroups: [],
        },
        "sticker": {
          id: "sticker", name: "Sticker Sorpresa",
          description: "Un Sticker sorpresa de nuestros más de 15 estilos diferentes 🔥😎",
          price: 0.50, image: "🎨", imageUrl: "", category: "extras", order: 1, modifierGroups: [],
        },
      };
      await fbSet("menu/products", PRODUCTS_DATA);

      addLog("✅ ¡Migración completada exitosamente!");
      addLog(`📊 ${Object.keys(PRODUCTS_DATA).length} productos guardados`);
      addLog(`📂 ${Object.keys(CATEGORIES_DATA).length} categorías guardadas`);
      setStatus("done");
    } catch (e) {
      addLog(`❌ Error: ${e.message}`);
      setStatus("error");
    }
  };

  return (
    <div style={{ ...S.container, maxWidth: 600 }}>
      <div style={{ textAlign: "center", padding: "30px 0 20px" }}>
        <div style={{ fontSize: 48 }}>📦</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", margin: "8px 0" }}>Migración de Menú</h1>
        <p style={{ color: "#888", fontSize: 14 }}>Subir productos del data.js a Firebase</p>
      </div>

      <div style={S.card}>
        <p style={{ color: "#ccc", fontSize: 14, lineHeight: 1.6 }}>
          Esta página migra los productos del menú actual a Firebase para que puedan editarse desde el panel admin.
          <br /><br />
          <strong style={{ color: "#f59e0b" }}>⚠️ Solo necesitás correr esto UNA vez.</strong>
        </p>

        {status === "idle" && (
          <button style={{ ...S.btnPrimary, marginTop: 12 }} onClick={migrate}>
            🚀 Iniciar migración
          </button>
        )}

        {status === "running" && (
          <button style={{ ...S.btnPrimary, marginTop: 12, opacity: 0.6 }} disabled>
            ⏳ Migrando...
          </button>
        )}

        {status === "done" && (
          <div style={{ marginTop: 16, padding: 14, background: "#0a2a0a", border: "1px solid #16a34a", borderRadius: 10, textAlign: "center" }}>
            <p style={{ color: "#4ade80", fontSize: 16, fontWeight: 700, margin: 0 }}>✅ ¡Migración completada!</p>
            <p style={{ color: "#888", fontSize: 12, margin: "4px 0 0" }}>Ya podés volver al panel admin</p>
          </div>
        )}

        {log.length > 0 && (
          <div style={{ marginTop: 16, padding: 12, background: "#0a0a0a", borderRadius: 8, border: "1px solid #222", maxHeight: 300, overflowY: "auto" }}>
            {log.map((msg, i) => (
              <div key={i} style={{ fontSize: 13, color: "#ccc", padding: "3px 0", fontFamily: "monospace" }}>{msg}</div>
            ))}
          </div>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 16 }}>
        <a href="/" style={{ color: "#60a5fa", fontSize: 14 }}>← Volver al panel</a>
      </div>
    </div>
  );
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
  if (user.role === "menu_editor") return <MenuEditorDash user={user} onLogout={logout} />;
  if (user.role === "stats") return <StatsDash user={user} onLogout={logout} />;
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
    const order = orders[oid];
    const branchObj = BRANCHES.find(b => b.id === bid);
    await fbUpdate(`orders/${oid}`, { branch: bid, status: "assigned", assignedAt: Date.now(), assignedBy: user.name });
    // Sync to Supabase ERP
    if (order?.orderId && branchObj?.erpId) {
      supabaseUpdateOrder(order.orderId, {
        sucursal_id: branchObj.erpId,
        estado: "asignada",
      });
    }
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
          {!["delivered", "cancelled"].includes(o.status) && (<button style={S.btnDanger} onClick={async () => { if (window.confirm("¿Cancelar?")) { await fbUpdate(`orders/${oid}`, { status: "cancelled" }); if (o.orderId) supabaseUpdateOrder(o.orderId, { estado: "cancelada" }); setView("list"); load(); } }}>❌ Cancelar pedido</button>)}
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
    const order = orders[oid];
    await fbUpdate(`orders/${oid}`, { status: s, [`statusUpdates/${s}`]: Date.now(), ...extra });
    // Sync to Supabase ERP
    if (order?.orderId) {
      supabaseUpdateOrder(order.orderId, { estado: mapStatusToErp(s) });
    }
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
                onClick={async () => {
                  const extra = { prepMinutes: prepTime, prepStartedAt: Date.now() };
                  await setStatus(oid, "preparing", extra);
                  setSel([oid, { ...o, status: "preparing", ...extra }]);
                  setPrepTime(null);

                  // AUTO-ASIGNACIÓN: ejecutar algoritmo después de aceptar
                  try {
                    const [latestOrders, latestUsers, latestDriversLoc] = await Promise.all([
                      fbGet("orders"), fbGet("users"), fbGet("drivers_location"),
                    ]);
                    // Usar el pedido actualizado con prepMinutes
                    const updatedOrders = { ...latestOrders, [oid]: { ...latestOrders[oid], ...extra } };
                    const result = asignarPedidoAutomatico(oid, updatedOrders, latestUsers || {}, latestDriversLoc || {});
                    if (result && result.driverId) {
                      const driver = (latestUsers || {})[result.driverId];
                      await fbUpdate(`orders/${oid}`, {
                        driverId: result.driverId,
                        driverUserId: result.driverId,
                        driverName: driver?.name || "",
                        autoAssigned: true,
                        autoAssignReason: result.reason,
                        autoAssignedAt: Date.now(),
                      });
                      // Sincronizar motorista al ERP
                      const fullOrder = latestOrders[oid];
                      if (fullOrder?.orderId && driver?.name) {
                        supabaseUpdateOrder(fullOrder.orderId, { repartidor_nombre: driver.name });
                      }
                    } else {
                      // No se pudo asignar automáticamente
                      await fbUpdate(`orders/${oid}`, { autoAssignPending: true });
                    }
                  } catch (e) {
                    console.error("Error en auto-asignación:", e);
                  }
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
  const [driversLoc, setDriversLoc] = useState({});
  const [view, setView] = useState("list");
  const [sel, setSel] = useState(null);
  const poll = useRef(null);

  const load = useCallback(async () => {
    const [o, u, dl] = await Promise.all([fbGet("orders"), fbGet("users"), fbGet("drivers_location")]);
    setOrders(o || {}); setUsers(u || {}); setDriversLoc(dl || {});
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
    const order = orders[oid];
    await fbUpdate(`orders/${oid}`, { driverId: driverId || null, driverName: driver?.name || "", driverUserId: driverId || null });
    // Update selected order locally so UI reflects immediately
    if (sel && sel[0] === oid) {
      setSel([oid, { ...sel[1], driverId: driverId || null, driverName: driver?.name || "", driverUserId: driverId || null }]);
    }
    // Sync to Supabase ERP
    if (order?.orderId) {
      supabaseUpdateOrder(order.orderId, { repartidor_nombre: driver?.name || null });
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
            <div key={id} style={{ ...S.orderCard, borderColor: o.autoAssignPending ? "#ef4444" : "#222", borderWidth: o.autoAssignPending ? 2 : 1 }} onClick={() => { setSel([id, o]); setView("detail"); }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontWeight: 800, fontFamily: "monospace", color: "#fff", fontSize: 14 }}>{o.orderId}</span>
                  {o.autoAssigned && <span style={{ fontSize: 10, background: "#0a2a0a", color: "#4ade80", padding: "2px 6px", borderRadius: 4, fontWeight: 700, border: "1px solid #166534" }}>🤖 Auto</span>}
                  {o.autoAssignPending && !o.driverName && <span style={{ fontSize: 10, background: "#2a0a0a", color: "#f87171", padding: "2px 6px", borderRadius: 4, fontWeight: 700, border: "1px solid #991b1b" }}>⚠️ Manual</span>}
                </div>
                <span style={{ ...S.badge, background: st.color }}>{st.icon} {st.label}</span>
              </div>
              <div style={{ fontSize: 13, color: "#ccc", marginBottom: 3 }}>👤 {o.customer?.name} · 📍 {o.delivery?.address}</div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, color: "#f97316" }}>${o.total?.toFixed(2)}</span>
                <span style={{ fontSize: 12, color: o.driverName ? "#10b981" : "#ef4444" }}>{o.driverName ? `🏍️ ${o.driverName}` : "⚠️ Sin driver"}</span>
              </div>
            </div>);
        })}

      {/* Drivers live map */}
      <DriversMap drivers={myDrivers} driversLoc={driversLoc} branch={user.branch} />

      <div style={S.footer}>{getBranch(user.branch).name} · Asignador</div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// MENU EDITOR DASHBOARD
// ═══════════════════════════════════════════════
function MenuEditorDash({ user, onLogout }) {
  const [menu, setMenu] = useState({ products: {}, categories: {}, store: {} });
  const [view, setView] = useState("products"); // products | edit | new | categories
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    const m = await fbGet("menu");
    setMenu(m || { products: {}, categories: {}, store: {} });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const products = Object.values(menu.products || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
  const categories = Object.values(menu.categories || {}).sort((a, b) => (a.order || 0) - (b.order || 0));

  const filteredProducts = filter === "all" ? products : products.filter(p => p.category === filter);

  const deleteProduct = async (pid) => {
    if (!window.confirm(`¿Eliminar este producto? Esta acción no se puede deshacer.`)) return;
    await fbSet(`menu/products/${pid}`, null);
    load();
  };

  const saveProduct = async (productData) => {
    const id = productData.id || `prod-${Date.now()}`;
    await fbSet(`menu/products/${id}`, { ...productData, id });
    setView("products");
    setEditingId(null);
    load();
  };

  if (loading) return <div style={S.center}><p style={{ color: "#888" }}>Cargando menú...</p></div>;

  // ── EDIT/NEW PRODUCT ──
  if (view === "edit" || view === "new") {
    const editing = view === "edit" ? menu.products[editingId] : null;
    return (
      <ProductEditor
        product={editing}
        categories={categories}
        onSave={saveProduct}
        onCancel={() => { setView("products"); setEditingId(null); }}
      />
    );
  }

  // ── CATEGORIES MANAGEMENT ──
  if (view === "categories") {
    return (
      <CategoriesEditor
        categories={menu.categories || {}}
        onClose={() => { setView("products"); load(); }}
      />
    );
  }

  // ── PRODUCTS LIST ──
  return (
    <div style={S.container}>
      <div style={S.topBar}>
        <div>
          <h1 style={S.logo}>🍽️ Editor de Menú</h1>
          <p style={{ fontSize: 12, color: "#10b981", margin: 0 }}>{products.length} productos · {categories.length} categorías</p>
        </div>
        <button style={{ ...S.btnSmall, color: "#ef4444" }} onClick={onLogout}>Salir</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button style={{ ...S.btnPrimary, flex: 1 }} onClick={() => { setView("new"); setEditingId(null); }}>+ Nuevo producto</button>
        <button style={{ ...S.btnSec, flex: 1 }} onClick={() => setView("categories")}>📂 Categorías</button>
      </div>

      {/* Category filter */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 14, paddingBottom: 4 }}>
        <button onClick={() => setFilter("all")} style={{
          padding: "8px 14px", borderRadius: 20, border: filter === "all" ? "2px solid #f97316" : "1px solid #333",
          background: filter === "all" ? "#f9731620" : "#111", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap"
        }}>Todos ({products.length})</button>
        {categories.map(cat => {
          const count = products.filter(p => p.category === cat.id).length;
          return (
            <button key={cat.id} onClick={() => setFilter(cat.id)} style={{
              padding: "8px 14px", borderRadius: 20, border: filter === cat.id ? "2px solid #f97316" : "1px solid #333",
              background: filter === cat.id ? "#f9731620" : "#111", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap"
            }}>{cat.name} ({count})</button>
          );
        })}
      </div>

      {/* Products list */}
      {filteredProducts.length === 0 ? (
        <div style={S.empty}>
          <p style={{ fontSize: 36 }}>🍽️</p>
          <p>No hay productos en esta categoría</p>
        </div>
      ) : (
        filteredProducts.map(p => {
          const cat = categories.find(c => c.id === p.category);
          return (
            <div key={p.id} style={{ ...S.orderCard, display: "flex", gap: 12, alignItems: "center" }}>
              {/* Image or emoji */}
              <div style={{ width: 56, height: 56, borderRadius: 10, background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0, overflow: "hidden" }}>
                {p.imageUrl ? <img src={p.imageUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (p.image || "🍽️")}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{p.name}</span>
                  {p.badge && <span style={{ ...S.badge, background: "#f97316", fontSize: 9 }}>{p.badge}</span>}
                </div>
                <div style={{ fontSize: 12, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  <span style={{ fontWeight: 800, color: "#f97316", fontSize: 14 }}>${p.price?.toFixed(2)}</span>
                  {cat && <span style={{ fontSize: 11, color: "#666" }}>📂 {cat.name}</span>}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button style={{ ...S.btnSmall, padding: "6px 10px" }} onClick={() => { setEditingId(p.id); setView("edit"); }}>✏️</button>
                <button style={{ ...S.btnSmall, padding: "6px 10px", color: "#ef4444", borderColor: "#7f1d1d" }} onClick={() => deleteProduct(p.id)}>🗑️</button>
              </div>
            </div>
          );
        })
      )}

      <div style={S.footer}>Editor de Menú · Cambios visibles inmediatamente en el menú del cliente</div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// PRODUCT EDITOR (Create/Edit)
// ═══════════════════════════════════════════════
function ProductEditor({ product, categories, onSave, onCancel }) {
  const isNew = !product;
  const [name, setName] = useState(product?.name || "");
  const [description, setDescription] = useState(product?.description || "");
  const [price, setPrice] = useState(product?.price || "");
  const [category, setCategory] = useState(product?.category || categories[0]?.id || "");
  const [image, setImage] = useState(product?.image || "🍽️");
  const [imageUrl, setImageUrl] = useState(product?.imageUrl || "");
  const [badge, setBadge] = useState(product?.badge || "");
  const [order, setOrder] = useState(product?.order || 99);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef(null);

  // Compress image before uploading to save bandwidth and storage
  const compressImage = (file, maxWidth = 800, quality = 0.8) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let w = img.width, h = img.height;
          if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob(blob => {
            if (blob) resolve(new File([blob], file.name, { type: "image/jpeg" }));
            else reject(new Error("Compression failed"));
          }, "image/jpeg", quality);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setUploadError("Solo se permiten imágenes");
      return;
    }

    setUploadError("");
    setUploading(true);

    try {
      // Compress the image first
      const compressed = await compressImage(file);
      // Generate unique filename
      const ext = "jpg";
      const filename = `products/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
      // Upload to Firebase Storage
      const url = await fbStorageUpload(compressed, filename);
      setImageUrl(url);
    } catch (err) {
      console.error("Upload error:", err);
      setUploadError("Error al subir la imagen: " + err.message);
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!name.trim() || !price || !category) {
      alert("Completá nombre, precio y categoría");
      return;
    }
    setSaving(true);
    await onSave({
      id: product?.id,
      name: name.trim(),
      description: description.trim(),
      price: parseFloat(price),
      category,
      image: image.trim() || "🍽️",
      imageUrl: imageUrl.trim(),
      badge: badge.trim(),
      order: parseInt(order) || 99,
      modifierGroups: product?.modifierGroups || [],
    });
    setSaving(false);
  };

  return (
    <div style={S.container}>
      <div style={S.topBar}>
        <button style={S.backBtn} onClick={onCancel}>← Cancelar</button>
        <h2 style={S.topTitle}>{isNew ? "Nuevo producto" : "Editar producto"}</h2>
      </div>

      <div style={S.card}>
        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Nombre *</label>
          <input style={S.fieldInput} value={name} onChange={e => setName(e.target.value)} placeholder="Freakie Burger" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Descripción</label>
          <textarea style={{ ...S.fieldInput, minHeight: 70, resize: "vertical" }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción del producto..." />
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Precio (USD) *</label>
            <input style={S.fieldInput} type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="9.99" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Orden</label>
            <input style={S.fieldInput} type="number" value={order} onChange={e => setOrder(e.target.value)} placeholder="1" />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Categoría *</label>
          <select style={S.fieldInput} value={category} onChange={e => setCategory(e.target.value)}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Emoji (mostrado si no hay imagen)</label>
          <input style={S.fieldInput} value={image} onChange={e => setImage(e.target.value)} placeholder="🍔" maxLength={6} />
        </div>

        {/* Image upload section */}
        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Imagen del producto</label>

          {/* Preview */}
          {imageUrl && (
            <div style={{ marginBottom: 10, position: "relative", display: "inline-block" }}>
              <img src={imageUrl} alt="preview" style={{ maxWidth: 200, maxHeight: 200, borderRadius: 10, border: "1px solid #333" }} />
              <button
                onClick={() => setImageUrl("")}
                style={{ position: "absolute", top: 6, right: 6, width: 28, height: 28, borderRadius: "50%", background: "#7f1d1d", color: "#fff", border: "1px solid #991b1b", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}
              >×</button>
            </div>
          )}

          {/* Upload button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            style={{ display: "none" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{ ...S.btnSec, flex: 1, opacity: uploading ? 0.6 : 1 }}
            >
              {uploading ? "⏳ Subiendo..." : imageUrl ? "📷 Cambiar imagen" : "📷 Subir imagen"}
            </button>
          </div>

          {uploadError && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 6 }}>{uploadError}</p>}

          {/* Manual URL option */}
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", fontSize: 12, color: "#666" }}>O pegar URL manualmente</summary>
            <input
              style={{ ...S.fieldInput, marginTop: 8 }}
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </details>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Etiqueta (ej: "Popular", "Nuevo", "Más vendido")</label>
          <input style={S.fieldInput} value={badge} onChange={e => setBadge(e.target.value)} placeholder="Popular" />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button style={{ ...S.btnPrimary, flex: 2 }} onClick={handleSave} disabled={saving || uploading}>
            {saving ? "Guardando..." : isNew ? "Crear producto" : "Guardar cambios"}
          </button>
          <button style={{ ...S.btnSec, flex: 1 }} onClick={onCancel}>Cancelar</button>
        </div>

        {!isNew && (
          <p style={{ fontSize: 11, color: "#555", textAlign: "center", marginTop: 12 }}>
            Los modificadores (extras, salsas, etc) se mantienen al editar
          </p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// CATEGORIES EDITOR
// ═══════════════════════════════════════════════
function CategoriesEditor({ categories, onClose }) {
  const [cats, setCats] = useState(categories);
  const [editing, setEditing] = useState(null); // category id being edited
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("");

  const addCategory = async () => {
    if (!newName.trim()) return;
    const id = newName.toLowerCase().replace(/[^a-z0-9]+/g, "_").substring(0, 20);
    const order = Math.max(0, ...Object.values(cats).map(c => c.order || 0)) + 1;
    const newCat = { id, name: newName.trim(), emoji: newEmoji.trim() || "📂", order };
    await fbSet(`menu/categories/${id}`, newCat);
    setCats({ ...cats, [id]: newCat });
    setNewName(""); setNewEmoji("");
  };

  const deleteCategory = async (id) => {
    if (!window.confirm("¿Eliminar esta categoría? Los productos en esta categoría perderán su clasificación.")) return;
    await fbSet(`menu/categories/${id}`, null);
    const updated = { ...cats };
    delete updated[id];
    setCats(updated);
  };

  const updateCategory = async (id, updates) => {
    const updated = { ...cats[id], ...updates };
    await fbSet(`menu/categories/${id}`, updated);
    setCats({ ...cats, [id]: updated });
    setEditing(null);
  };

  const sortedCats = Object.values(cats).sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div style={S.container}>
      <div style={S.topBar}>
        <button style={S.backBtn} onClick={onClose}>← Volver</button>
        <h2 style={S.topTitle}>Categorías</h2>
      </div>

      <div style={S.card}>
        <h3 style={S.secTitle}>+ Agregar nueva categoría</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input style={{ ...S.fieldInput, flex: 1 }} value={newEmoji} onChange={e => setNewEmoji(e.target.value)} placeholder="🍕" maxLength={4} />
          <input style={{ ...S.fieldInput, flex: 3 }} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre de la categoría" />
        </div>
        <button style={S.btnPrimary} onClick={addCategory}>Agregar</button>
      </div>

      {sortedCats.map(c => (
        <div key={c.id} style={S.card}>
          {editing === c.id ? (
            <CategoryEditForm category={c} onSave={(updates) => updateCategory(c.id, updates)} onCancel={() => setEditing(null)} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 32 }}>{c.emoji || "📂"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#888" }}>ID: {c.id} · Orden: {c.order || 0}</div>
              </div>
              <button style={S.btnSmall} onClick={() => setEditing(c.id)}>✏️</button>
              <button style={{ ...S.btnSmall, color: "#ef4444", borderColor: "#7f1d1d" }} onClick={() => deleteCategory(c.id)}>🗑️</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CategoryEditForm({ category, onSave, onCancel }) {
  const [name, setName] = useState(category.name);
  const [emoji, setEmoji] = useState(category.emoji || "");
  const [order, setOrder] = useState(category.order || 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input style={{ ...S.fieldInput, flex: 1 }} value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="📂" maxLength={4} />
        <input style={{ ...S.fieldInput, flex: 3 }} value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={S.label}>Orden</label>
        <input style={S.fieldInput} type="number" value={order} onChange={e => setOrder(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button style={S.btnPrimary} onClick={() => onSave({ name: name.trim(), emoji: emoji.trim(), order: parseInt(order) || 0 })}>Guardar</button>
        <button style={S.btnSec} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// STATS DASHBOARD — Analytics
// ═══════════════════════════════════════════════
function StatsDash({ user, onLogout }) {
  const [orders, setOrders] = useState({});
  const [users, setUsers] = useState({});
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("all"); // today | week | month | all
  const [branchFilter, setBranchFilter] = useState("all");

  useEffect(() => {
    async function load() {
      const [o, u] = await Promise.all([fbGet("orders"), fbGet("users")]);
      setOrders(o || {}); setUsers(u || {}); setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div style={S.center}><p style={{ color: "#888" }}>Cargando analytics...</p></div>;

  const now = Date.now();
  const DAY = 86400000;
  const allOrders = Object.entries(orders);

  // Period filter
  const periodFilter = (ts) => {
    if (period === "today") return now - ts < DAY;
    if (period === "week") return now - ts < DAY * 7;
    if (period === "month") return now - ts < DAY * 30;
    return true;
  };

  // Apply filters
  const filtered = allOrders.filter(([, o]) => {
    if (!periodFilter(o.createdAt || 0)) return false;
    if (branchFilter !== "all" && o.branch !== branchFilter) return false;
    return true;
  });

  const delivered = filtered.filter(([, o]) => o.status === "delivered");
  const cancelled = filtered.filter(([, o]) => o.status === "cancelled");
  const active = filtered.filter(([, o]) => !["delivered", "cancelled"].includes(o.status));

  // Revenue
  const totalRevenue = delivered.reduce((s, [, o]) => s + (o.total || 0), 0);
  const avgTicket = delivered.length > 0 ? totalRevenue / delivered.length : 0;

  // Products ranking
  const productCounts = {};
  delivered.forEach(([, o]) => {
    (o.items || []).forEach(it => {
      const key = it.name || "Desconocido";
      productCounts[key] = (productCounts[key] || 0) + (it.qty || 1);
    });
  });
  const topProducts = Object.entries(productCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Branch stats
  const branchStats = {};
  BRANCHES.forEach(b => { branchStats[b.id] = { orders: 0, revenue: 0, delivered: 0, cancelled: 0, prepTimes: [], deliveryTimes: [] }; });
  filtered.forEach(([, o]) => {
    const bid = o.branch;
    if (bid && branchStats[bid]) {
      branchStats[bid].orders++;
      if (o.status === "delivered") {
        branchStats[bid].delivered++;
        branchStats[bid].revenue += o.total || 0;
        if (o.prepMinutes) branchStats[bid].prepTimes.push(o.prepMinutes);
        if (o.statusUpdates?.on_the_way && o.statusUpdates?.delivered) {
          const deliveryMin = (o.statusUpdates.delivered - o.statusUpdates.on_the_way) / 60000;
          if (deliveryMin > 0 && deliveryMin < 180) branchStats[bid].deliveryTimes.push(deliveryMin);
        }
      }
      if (o.status === "cancelled") branchStats[bid].cancelled++;
    }
  });

  // Payment methods
  const payments = { cash: 0, transfer: 0, card: 0 };
  delivered.forEach(([, o]) => { if (o.payment && payments[o.payment] !== undefined) payments[o.payment]++; });
  const payTotal = Object.values(payments).reduce((a, b) => a + b, 0) || 1;

  // Hourly distribution
  const hourly = new Array(24).fill(0);
  delivered.forEach(([, o]) => {
    if (o.createdAt) {
      const h = new Date(o.createdAt).getHours();
      hourly[h]++;
    }
  });
  const maxHourly = Math.max(1, ...hourly);

  // Top drivers
  const driverCounts = {};
  delivered.forEach(([, o]) => {
    if (o.driverName) driverCounts[o.driverName] = (driverCounts[o.driverName] || 0) + 1;
  });
  const topDrivers = Object.entries(driverCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Cities/zones
  const cityCounts = {};
  delivered.forEach(([, o]) => {
    const city = o.delivery?.city || "Sin ciudad";
    cityCounts[city] = (cityCounts[city] || 0) + 1;
  });
  const topCities = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : "—";

  return (
    <div style={S.container}>
      <div style={S.topBar}>
        <div>
          <h1 style={S.logo}>📊 Analytics</h1>
          <p style={{ fontSize: 12, color: "#10b981", margin: 0 }}>Freakie Dogs</p>
        </div>
        <button style={{ ...S.btnSmall, color: "#ef4444" }} onClick={onLogout}>Salir</button>
      </div>

      {/* Period selector */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto" }}>
        {[{ l: "Hoy", v: "today" }, { l: "Semana", v: "week" }, { l: "Mes", v: "month" }, { l: "Todo", v: "all" }].map(p => (
          <button key={p.v} onClick={() => setPeriod(p.v)} style={{
            padding: "8px 16px", borderRadius: 20, border: period === p.v ? "2px solid #f97316" : "1px solid #333",
            background: period === p.v ? "#f9731620" : "#111", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer"
          }}>{p.l}</button>
        ))}
      </div>

      {/* Branch filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }}>
        <button onClick={() => setBranchFilter("all")} style={{
          padding: "6px 12px", borderRadius: 20, border: branchFilter === "all" ? "2px solid #3b82f6" : "1px solid #333",
          background: branchFilter === "all" ? "#3b82f620" : "#111", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer"
        }}>Todas</button>
        {BRANCHES.map(b => (
          <button key={b.id} onClick={() => setBranchFilter(b.id)} style={{
            padding: "6px 12px", borderRadius: 20, border: branchFilter === b.id ? "2px solid #3b82f6" : "1px solid #333",
            background: branchFilter === b.id ? "#3b82f620" : "#111", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap"
          }}>{b.name}</button>
        ))}
      </div>

      {/* Main KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        <div style={S.card}><div style={{ fontSize: 11, color: "#888" }}>💰 Ventas totales</div><div style={{ fontSize: 24, fontWeight: 800, color: "#10b981" }}>${totalRevenue.toFixed(2)}</div></div>
        <div style={S.card}><div style={{ fontSize: 11, color: "#888" }}>📋 Pedidos</div><div style={{ fontSize: 24, fontWeight: 800, color: "#3b82f6" }}>{delivered.length}</div><div style={{ fontSize: 11, color: "#666" }}>{cancelled.length} cancelados · {active.length} activos</div></div>
        <div style={S.card}><div style={{ fontSize: 11, color: "#888" }}>🎫 Ticket promedio</div><div style={{ fontSize: 24, fontWeight: 800, color: "#f97316" }}>${avgTicket.toFixed(2)}</div></div>
        <div style={S.card}><div style={{ fontSize: 11, color: "#888" }}>📊 Tasa de completado</div><div style={{ fontSize: 24, fontWeight: 800, color: "#8b5cf6" }}>{filtered.length ? Math.round(delivered.length / (delivered.length + cancelled.length) * 100) || 0 : 0}%</div></div>
      </div>

      {/* Top Products */}
      <div style={{ ...S.card, marginBottom: 12 }}>
        <h3 style={{ ...S.secTitle, marginBottom: 10 }}>🏆 Productos más vendidos</h3>
        {topProducts.length === 0 ? <p style={{ color: "#666", fontSize: 13 }}>Sin datos</p> :
          topProducts.map(([name, count], i) => {
            const maxCount = topProducts[0][1] || 1;
            return (
              <div key={name} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 13, color: "#ccc" }}>{i + 1}. {name}</span>
                  <span style={{ fontSize: 13, color: "#f97316", fontWeight: 700 }}>{count}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "#222" }}>
                  <div style={{ height: 6, borderRadius: 3, background: i === 0 ? "#f97316" : "#f9731660", width: `${(count / maxCount) * 100}%` }} />
                </div>
              </div>
            );
          })
        }
      </div>

      {/* Hourly chart */}
      <div style={{ ...S.card, marginBottom: 12 }}>
        <h3 style={{ ...S.secTitle, marginBottom: 10 }}>⏰ Pedidos por hora</h3>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80 }}>
          {hourly.map((count, h) => (
            <div key={h} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{
                width: "100%", minHeight: 2,
                height: `${(count / maxHourly) * 60}px`,
                background: count > 0 ? (h >= 11 && h <= 14 ? "#f97316" : h >= 18 && h <= 21 ? "#8b5cf6" : "#3b82f6") : "#222",
                borderRadius: "2px 2px 0 0",
              }} />
              {h % 3 === 0 && <span style={{ fontSize: 8, color: "#555", marginTop: 2 }}>{h}h</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Branch comparison */}
      {branchFilter === "all" && (
        <div style={{ ...S.card, marginBottom: 12 }}>
          <h3 style={{ ...S.secTitle, marginBottom: 10 }}>📍 Por sucursal</h3>
          {BRANCHES.map(b => {
            const bs = branchStats[b.id];
            if (bs.orders === 0) return null;
            return (
              <div key={b.id} style={{ marginBottom: 12, padding: 10, background: "#0a0a0a", borderRadius: 8 }}>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: 14, marginBottom: 6 }}>📍 {b.name}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  <div><div style={{ fontSize: 10, color: "#888" }}>Pedidos</div><div style={{ fontSize: 16, fontWeight: 800, color: "#3b82f6" }}>{bs.delivered}</div></div>
                  <div><div style={{ fontSize: 10, color: "#888" }}>Ventas</div><div style={{ fontSize: 16, fontWeight: 800, color: "#10b981" }}>${bs.revenue.toFixed(0)}</div></div>
                  <div><div style={{ fontSize: 10, color: "#888" }}>Cancelados</div><div style={{ fontSize: 16, fontWeight: 800, color: "#ef4444" }}>{bs.cancelled}</div></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                  <div><div style={{ fontSize: 10, color: "#888" }}>Prep. promedio</div><div style={{ fontSize: 14, fontWeight: 700, color: "#f59e0b" }}>{avg(bs.prepTimes)} min</div></div>
                  <div><div style={{ fontSize: 10, color: "#888" }}>Entrega promedio</div><div style={{ fontSize: 14, fontWeight: 700, color: "#a855f7" }}>{avg(bs.deliveryTimes)} min</div></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Payment methods */}
      <div style={{ ...S.card, marginBottom: 12 }}>
        <h3 style={{ ...S.secTitle, marginBottom: 10 }}>💳 Métodos de pago</h3>
        {[{ l: "💵 Efectivo", k: "cash", c: "#10b981" }, { l: "🏦 Transferencia", k: "transfer", c: "#3b82f6" }, { l: "💳 Tarjeta", k: "card", c: "#8b5cf6" }].map(p => (
          <div key={p.k} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 13, color: "#ccc" }}>{p.l}</span>
              <span style={{ fontSize: 13, color: p.c, fontWeight: 700 }}>{payments[p.k]} ({Math.round(payments[p.k] / payTotal * 100)}%)</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "#222" }}>
              <div style={{ height: 6, borderRadius: 3, background: p.c, width: `${(payments[p.k] / payTotal) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Top drivers */}
      {topDrivers.length > 0 && (
        <div style={{ ...S.card, marginBottom: 12 }}>
          <h3 style={{ ...S.secTitle, marginBottom: 10 }}>🏍️ Drivers con más entregas</h3>
          {topDrivers.map(([name, count], i) => (
            <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1a1a1a" }}>
              <span style={{ fontSize: 13, color: "#ccc" }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`} {name}</span>
              <span style={{ fontSize: 13, color: "#10b981", fontWeight: 700 }}>{count} entregas</span>
            </div>
          ))}
        </div>
      )}

      {/* Top cities/zones */}
      {topCities.length > 0 && (
        <div style={{ ...S.card, marginBottom: 12 }}>
          <h3 style={{ ...S.secTitle, marginBottom: 10 }}>🏙️ Zonas con más pedidos</h3>
          {topCities.map(([city, count], i) => (
            <div key={city} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1a1a1a" }}>
              <span style={{ fontSize: 13, color: "#ccc" }}>{i + 1}. {city}</span>
              <span style={{ fontSize: 13, color: "#3b82f6", fontWeight: 700 }}>{count}</span>
            </div>
          ))}
        </div>
      )}

      <div style={S.footer}>Analytics · Freakie Dogs © 2026</div>
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
  const alwaysGpsRef = useRef(null);
  const poll = useRef(null);

  const load = useCallback(async () => { setOrders((await fbGet("orders")) || {}); }, []);
  useEffect(() => { load(); poll.current = setInterval(load, 2000); return () => clearInterval(poll.current); }, [load]);
  useEffect(() => {
    return () => {
      if (gpsRef.current) navigator.geolocation.clearWatch(gpsRef.current);
      if (alwaysGpsRef.current) navigator.geolocation.clearWatch(alwaysGpsRef.current);
    };
  }, []);

  // Always-on GPS: share location while logged in so el algoritmo sepa si está en sucursal
  useEffect(() => {
    if (!navigator.geolocation) return;
    alwaysGpsRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const loc = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          timestamp: Date.now(),
          accuracy: p.coords.accuracy,
          name: user.name,
          branch: user.branch,
        };
        fbSet(`drivers_location/${user.id}`, loc);
      },
      (err) => console.error("GPS siempre:", err),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    return () => {
      if (alwaysGpsRef.current) navigator.geolocation.clearWatch(alwaysGpsRef.current);
    };
  }, [user.id, user.name, user.branch]);

  const myOrders = Object.entries(orders)
    .filter(([, o]) => o.driverUserId === user.id && !["delivered", "cancelled"].includes(o.status))
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  const delivered = Object.entries(orders)
    .filter(([, o]) => o.driverUserId === user.id && o.status === "delivered")
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0)).slice(0, 5);

  const startDelivery = async (oid) => {
    const order = orders[oid];
    setOrders(prev => ({ ...prev, [oid]: { ...prev[oid], status: "on_the_way" } }));
    setActiveDelivery(oid);
    if (navigator.geolocation) {
      gpsRef.current = navigator.geolocation.watchPosition(
        p => {
          const loc = { lat: p.coords.latitude, lng: p.coords.longitude, timestamp: Date.now(), accuracy: p.coords.accuracy };
          fbSet(`tracking/${oid}`, loc);
          // Also save by driver so asignadores can see all drivers of their branch
          fbSet(`drivers_location/${user.id}`, { ...loc, name: user.name, branch: user.branch, orderId: oid });
        },
        err => console.error("GPS:", err), { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
      );
    }
    await fbUpdate(`orders/${oid}`, { status: "on_the_way", [`statusUpdates/on_the_way`]: Date.now() });
    // Sync to Supabase ERP
    if (order?.orderId) {
      supabaseUpdateOrder(order.orderId, { estado: "en_camino" });
    }
    load();
  };

  const completeDelivery = async (oid) => {
    const order = orders[oid];
    if (gpsRef.current) { navigator.geolocation.clearWatch(gpsRef.current); gpsRef.current = null; }
    setOrders(prev => ({ ...prev, [oid]: { ...prev[oid], status: "delivered" } }));
    setActiveDelivery(null);
    await fbUpdate(`orders/${oid}`, { status: "delivered", [`statusUpdates/delivered`]: Date.now() });
    await fbSet(`tracking/${oid}`, null);
    await fbSet(`drivers_location/${user.id}`, null);
    // Sync to Supabase ERP
    if (order?.orderId) {
      supabaseUpdateOrder(order.orderId, { estado: "entregada" });
    }
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
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontWeight: 800, fontFamily: "monospace", color: "#fff" }}>{o.orderId}</span>
                  {o.autoAssigned && <span style={{ fontSize: 10, background: "#0a2a0a", color: "#4ade80", padding: "2px 6px", borderRadius: 4, fontWeight: 700, border: "1px solid #166534" }}>🤖 Auto</span>}
                </div>
                <span style={{ ...S.badge, background: st.color }}>{st.icon} {st.label}</span>
              </div>
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

  // Load Google Fonts for tracking page
  useEffect(() => {
    if (!document.getElementById("fd-fonts")) {
      const link = document.createElement("link");
      link.id = "fd-fonts";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap";
      document.head.appendChild(link);
    }
  }, []);

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
    const driverSvg = `<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:#D42B28;border-radius:50%;box-shadow:0 3px 12px rgba(212,43,43,0.5);border:2px solid #fff"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><path d="M12 2l-4 9h8l-1 4"/><path d="M16 11l3 7"/><path d="M8 11L5 18"/></svg></div>`;
    const icon = window.L.divIcon({ html: driverSvg, iconSize: [40, 40], iconAnchor: [20, 20], className: "" });
    markerRef.current = window.L.marker([loc.lat, loc.lng], { icon }).addTo(map);
    if (order?.delivery?.coords) {
      const destSvg = `<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:#D42B28;border-radius:50%;box-shadow:0 3px 12px rgba(212,43,43,0.4)"><svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5z"/></svg></div>`;
      const di = window.L.divIcon({ html: destSvg, iconSize: [36, 36], iconAnchor: [18, 18], className: "" });
      window.L.marker([order.delivery.coords.lat, order.delivery.coords.lng], { icon: di }).addTo(map);
    }
    mapRef.current = map; setTimeout(() => map.invalidateSize(), 200);
  };

  // Design System v2.0 styles
  const T = {
    page: { maxWidth: 500, margin: "0 auto", minHeight: "100vh", background: "#0E0E0D", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", padding: "0 0 40px" },
    header: { textAlign: "center", padding: "24px 20px 16px" },
    logo: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, background: "#D42B28", borderRadius: 10, marginBottom: 8 },
    logoText: { fontFamily: "'Cooper Black', serif", fontSize: 18, color: "#F5C518", textShadow: "2px 2px 0 rgba(0,0,0,0.8)", margin: "4px 0" },
    subtitle: { fontSize: 12, color: "#9A9A9A", margin: 0 },
    orderId: { fontFamily: "'Plus Jakarta Sans', monospace", fontSize: 14, fontWeight: 700, color: "#D42B28", background: "rgba(212,43,43,0.15)", border: "1px solid rgba(212,43,43,0.4)", padding: "6px 14px", borderRadius: 8, letterSpacing: 1 },
    card: { background: "#1A1A1A", borderRadius: 12, padding: 16, margin: "0 16px 12px", border: "1px solid #2E2E26" },
    secTitle: { fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1.5 },
    row: { display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, color: "#9A9A9A" },
    footer: { textAlign: "center", padding: "24px 0", fontSize: 11, color: "#555555", fontFamily: "'Cooper Black', serif" },
  };

  // Status copy from Design System v2.0
  const statusCopy = {
    new: { icon: "🌶️", label: "Nuevo", copy: "Recibimos tu pedido 🌭", color: "#D42B28" },
    assigned: { icon: "🌶️", label: "Recibido", copy: "Recibimos tu pedido 🌭", color: "#D42B28" },
    preparing: { icon: "🍳", label: "Preparando", copy: "Preparando tu locura con todo el amor 🌶️", color: "#D42B28" },
    ready: { icon: "✨", label: "Listo", copy: "¡Tu pedido está listo! 🔥", color: "#F5C518" },
    on_the_way: { icon: "🚀", label: "En camino", copy: "Va volando hacia vos, aguantá poco 🚀", color: "#D42B28" },
    delivered: { icon: "✅", label: "Entregado", copy: "¡Buen provecho! 🌭🔥", color: "#4CAF50" },
    cancelled: { icon: "❌", label: "Cancelado", copy: "Pedido cancelado", color: "#ef4444" },
  };

  if (loading) return <div style={{ ...T.page, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: 40 }}>🌭</div><p style={{ color: "#9A9A9A", marginTop: 8 }}>Cargando...</p></div></div>;
  if (!order) return <div style={{ ...T.page, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: 48 }}>❌</div><p style={{ color: "#9A9A9A", marginTop: 8 }}>Pedido no encontrado</p></div></div>;

  const sc = statusCopy[order.status] || statusCopy.new;
  const steps = [
    { id: "received", icon: "🌶️", label: "Nuevo" },
    { id: "preparing", icon: "🍳", label: "Preparando" },
    { id: "on_the_way", icon: "🚀", label: "En camino" },
    { id: "delivered", icon: "✅", label: "Entregado" },
  ];
  const stepIds = ["received", "preparing", "on_the_way", "delivered"];
  const cur = Math.max(0, stepIds.indexOf(order.status === "assigned" ? "received" : order.status === "ready" ? "preparing" : order.status));

  return (
    <div style={T.page}>
      {/* Header */}
      <div style={T.header}>
        <div style={T.logo}><span style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>FD</span></div>
        <h1 style={T.logoText}>Freakie Dogs</h1>
        <p style={T.subtitle}>Seguimiento de pedido</p>
      </div>

      {/* Order ID */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <span style={T.orderId}>{order.orderId}</span>
      </div>

      {/* Progress bar — Design System tracking bar with brand icons */}
      <div style={{ display: "flex", alignItems: "center", padding: "0 20px", marginBottom: 8 }}>
        {steps.map((step, i) => {
          const active = i <= cur;
          const isCurrent = i === cur;
          return (
            <React.Fragment key={step.id}>
              {i > 0 && (
                <div style={{ flex: 1, height: 2, background: active ? "#D42B28" : "#2E2E26", transition: "background 0.3s" }} />
              )}
              <div style={{
                width: isCurrent ? 44 : 36, height: isCurrent ? 44 : 36,
                borderRadius: "50%",
                background: active ? "#D42B28" : "#1A1A1A",
                border: active ? "2px solid #D42B28" : "2px solid #2E2E26",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: isCurrent ? 20 : 16,
                boxShadow: isCurrent ? "0 0 16px rgba(212,43,43,0.4)" : "none",
                transition: "all 0.3s",
                flexShrink: 0,
              }}>
                {step.icon}
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ display: "flex", padding: "0 20px", marginBottom: 20 }}>
        {steps.map((step, i) => (
          <div key={step.id} style={{ flex: 1, textAlign: "center", fontSize: 9, color: i <= cur ? "#D42B28" : "#555", fontWeight: i === cur ? 700 : 400, letterSpacing: 0.5, textTransform: "uppercase" }}>
            {step.label}
          </div>
        ))}
      </div>

      {/* Status message — Design System copy */}
      <div style={{ textAlign: "center", marginBottom: 20, padding: "0 20px" }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>{sc.copy}</p>
      </div>

      {/* Countdown Timer — when preparing */}
      {(order.status === "preparing" || order.status === "assigned") && order.prepStartedAt && order.prepMinutes && (
        <CountdownTimer prepStartedAt={order.prepStartedAt} prepMinutes={order.prepMinutes} />
      )}
      {(order.status === "preparing" || order.status === "assigned") && !order.prepStartedAt && (
        <div style={{ ...T.card, textAlign: "center" }}>
          <p style={{ fontSize: 30 }}>👨‍🍳</p>
          <p style={{ color: "#9A9A9A", fontSize: 14 }}>Tu pedido está siendo procesado</p>
        </div>
      )}

      {/* Ready state */}
      {order.status === "ready" && (
        <div style={{ ...T.card, textAlign: "center", border: "1px solid rgba(245,197,24,0.3)", background: "rgba(245,197,24,0.05)" }}>
          <p style={{ fontSize: 36 }}>✨</p>
          <p style={{ color: "#F5C518", fontSize: 16, fontWeight: 700 }}>¡Tu pedido está listo!</p>
          <p style={{ color: "#9A9A9A", fontSize: 13 }}>Esperando motorista para la entrega</p>
        </div>
      )}

      {/* Map — when on the way */}
      {order.status === "on_the_way" && loc && (
        <div style={{ margin: "0 16px 12px" }}>
          <div id="tmap" style={{ width: "100%", height: 300, borderRadius: 12, border: "1px solid #2E2E26" }} />
          <p style={{ textAlign: "center", fontSize: 12, color: "#9A9A9A", marginTop: 8 }}>🏍️ Tu motorista viene en camino</p>
        </div>
      )}
      {order.status === "on_the_way" && !loc && (
        <div style={{ ...T.card, textAlign: "center" }}>
          <p style={{ fontSize: 30 }}>🏍️</p>
          <p style={{ color: "#9A9A9A", fontSize: 14 }}>Esperando GPS del motorista...</p>
        </div>
      )}

      {/* Delivered */}
      {order.status === "delivered" && (
        <div style={{ ...T.card, textAlign: "center", border: "1px solid rgba(76,175,80,0.3)", background: "rgba(76,175,80,0.05)" }}>
          <p style={{ fontSize: 40 }}>🎉</p>
          <p style={{ color: "#4CAF50", fontSize: 16, fontWeight: 700 }}>¡Pedido entregado!</p>
          <p style={{ color: "#9A9A9A", fontSize: 13 }}>¡Buen provecho! 🌭🔥</p>
        </div>
      )}

      {/* Mini game while waiting */}
      {!["delivered", "cancelled"].includes(order.status) && (
        <div style={{ margin: "0 16px 12px", background: "#1A1A1A", borderRadius: 12, padding: "12px 0", border: "1px solid rgba(245,197,24,0.2)" }}>
          <p style={{ fontFamily: "'Cooper Black', serif", fontSize: 14, color: "#F5C518", textShadow: "1px 1px 0 rgba(0,0,0,0.8)", textAlign: "center", marginBottom: 8 }}>🎮 Jugá mientras esperás</p>
          <FreakieRunner />
        </div>
      )}

      {/* Order summary */}
      <div style={T.card}>
        <h3 style={T.secTitle}>📋 Tu pedido</h3>
        {(order.items || []).map((it, i) => (
          <div key={i} style={T.row}>
            <span style={{ color: "#fff" }}>{it.qty}x {it.name}</span>
            <span style={{ fontWeight: 700, color: "#D42B28" }}>${(it.price * it.qty).toFixed(2)}</span>
          </div>
        ))}
        <div style={{ ...T.row, borderTop: "1px solid #2E2E26", marginTop: 8, paddingTop: 8 }}>
          <span style={{ fontWeight: 800, color: "#fff" }}>Total</span>
          <span style={{ fontWeight: 800, color: "#D42B28" }}>${order.total?.toFixed(2)}</span>
        </div>
      </div>

      {/* Driver info */}
      {order.driverName && (
        <div style={T.card}>
          <h3 style={T.secTitle}>🏍️ Tu motorista</h3>
          <p style={{ color: "#fff", fontSize: 15, margin: "2px 0", fontWeight: 600 }}>{order.driverName}</p>
        </div>
      )}

      <div style={T.footer}>Freakie Dogs © 2026 🌭🔥</div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// DRIVERS MAP — Live location of drivers for asignador
// ═══════════════════════════════════════════════
function DriversMap({ drivers, driversLoc, branch }) {
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const leafletOk = useRef(false);
  const mapId = `dmap-${branch}`;

  // Get drivers of this branch with location
  const activeDrivers = drivers
    .map(([id, d]) => {
      const loc = driversLoc[id];
      return loc && loc.branch === branch ? { id, name: d.name, code: d.code, ...loc } : null;
    })
    .filter(Boolean);

  // Load Leaflet
  useEffect(() => {
    if (leafletOk.current || window.L) { leafletOk.current = true; return; }
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    js.onload = () => { leafletOk.current = true; };
    document.head.appendChild(js);
  }, []);

  const initMap = () => {
    if (!window.L || !document.getElementById(mapId) || mapRef.current) return;
    const defaultCenter = activeDrivers.length > 0
      ? [activeDrivers[0].lat, activeDrivers[0].lng]
      : [13.6783, -89.2808];
    const map = window.L.map(mapId, { zoomControl: true }).setView(defaultCenter, 14);
    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { attribution: "© CARTO" }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);
    updateMarkers();
  };

  const updateMarkers = () => {
    if (!window.L || !mapRef.current) return;
    const map = mapRef.current;
    const L = window.L;

    Object.keys(markersRef.current).forEach(id => {
      if (!activeDrivers.find(d => d.id === id)) {
        map.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
      }
    });

    activeDrivers.forEach(d => {
      const html = `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none"><div style="background:#f97316;color:#fff;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.5);margin-bottom:2px">${d.name}</div><div style="width:36px;height:36px;background:#f97316;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(249,115,22,0.6);border:2px solid #fff"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><path d="M12 2l-4 9h8l-1 4"/><path d="M16 11l3 7"/><path d="M8 11L5 18"/></svg></div></div>`;
      const icon = L.divIcon({ html, iconSize: [60, 60], iconAnchor: [30, 50], className: "" });

      if (markersRef.current[d.id]) {
        markersRef.current[d.id].setLatLng([d.lat, d.lng]);
      } else {
        markersRef.current[d.id] = L.marker([d.lat, d.lng], { icon }).addTo(map);
      }
    });
  };

  // Initialize map when drivers appear and Leaflet is loaded
  useEffect(() => {
    if (activeDrivers.length === 0) {
      // Clean up map if no drivers
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = {};
      }
      return;
    }

    // Wait for Leaflet to be loaded, then init or update
    const tryInit = () => {
      if (!window.L) {
        setTimeout(tryInit, 200);
        return;
      }
      leafletOk.current = true;
      if (!mapRef.current) {
        // Wait for the div to be in the DOM
        setTimeout(() => initMap(), 50);
      } else {
        updateMarkers();
      }
    };
    tryInit();
  }, [driversLoc, activeDrivers.length]);

  return (
    <div style={{ marginTop: 16, marginBottom: 16, background: "#111", borderRadius: 12, border: "1px solid #222", overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #222" }}>
        <span style={{ fontSize: 13, color: "#999", fontWeight: 700 }}>📡 Motoristas en tiempo real</span>
        <span style={{ fontSize: 11, color: "#10b981", fontWeight: 600 }}>{activeDrivers.length} activos</span>
      </div>
      {activeDrivers.length === 0 ? (
        <div style={{ padding: "30px 20px", textAlign: "center", color: "#666", fontSize: 13 }}>
          <p style={{ fontSize: 28, margin: "0 0 4px" }}>🏍️</p>
          <p style={{ margin: 0 }}>Ningún motorista compartiendo ubicación</p>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#555" }}>El mapa aparecerá cuando algún motorista inicie una entrega</p>
        </div>
      ) : (
        <div id={mapId} style={{ width: "100%", height: 320 }} />
      )}
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
    <div style={{ overflow: "hidden" }}>
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
  label: { display: "block", fontSize: 12, color: "#999", marginBottom: 6, fontWeight: 600 },
  fieldInput: { width: "100%", padding: "11px 13px", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 14, boxSizing: "border-box", outline: "none", fontFamily: "inherit" },
};
