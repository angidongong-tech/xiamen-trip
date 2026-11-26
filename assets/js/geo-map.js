let leaflet;

function loadLeaflet() {
  if (!leaflet) {
    leaflet = Promise.all([
      loadAsset('link','href','leaflet.css'),
      loadAsset('script','src','leaflet.js')
    ]).then(()=>window.L).catch(error=>{
      leaflet=undefined;
      throw error;
    });
  }
  return leaflet;
}

function loadAsset(tag,attribute,file) {
  const url=new URL('../vendor/leaflet/'+file,import.meta.url).href;
  if (document.querySelector(tag+'['+attribute+'="'+url+'"][data-loaded]')) return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const element=document.createElement(tag);
    if (tag==='link') element.rel='stylesheet';
    element.onload=()=>{element.dataset.loaded='true';resolve();};
    element.onerror=()=>{element.remove();reject(new Error(file));};
    element[attribute]=url;
    document.head.append(element);
  });
}

const tileUrl='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const attribution='© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

export function mountGeoMap({target,points,extent,ferries,savedView,onView,onReady,onFallback}) {
  let map, timeout, tileTimer, disposed=false, ready=false;
  const markers=new Map();

  const cleanup=()=>{
    if (disposed) return;
    disposed=true;
    clearTimeout(timeout);
    clearTimeout(tileTimer);
    window.removeEventListener('offline',fallback);
    if (map) map.remove();
  };
  function fallback() {
    if (disposed) return;
    cleanup();
    onFallback();
  }
  function locate(id) {
    const marker=markers.get(id);
    if (!ready||!marker) return false;
    map.setView(marker.getLatLng(),Math.max(16,map.getZoom()));
    marker.openPopup();
    return true;
  }
  function reset() {
    if (!map||disposed) return;
    const positions=points.length?points.map(point=>point.position):extent;
    if (positions.length) map.fitBounds(positions,{padding:[25,25],maxZoom:16,animate:false});
    else map.setView([24.494,118.104],12);
  }
  window.addEventListener('offline',fallback);
  timeout=setTimeout(fallback,8500);
  loadLeaflet().then(L=>{
    if (disposed) return;
    map=L.map(target,{scrollWheelZoom:false,attributionControl:false,worldCopyJump:true,fadeAnimation:false,minZoom:7,maxZoom:19});
    const attributionControl=L.control.attribution({prefix:false}).addTo(map);
    attributionControl.addAttribution(attribution);
    if (savedView) map.setView(savedView.center,savedView.zoom);
    else reset();
    for (const point of points) {
      const icon=L.divIcon({
        className:'geo-marker '+point.kind,
        html:point.badge,
        iconSize:[30,30],
        iconAnchor:[15,15],
        popupAnchor:[0,-16]
      });
      const marker=L.marker(point.position,{icon,title:point.title,alt:point.title,riseOnHover:true}).addTo(map);
      marker.getElement()?.setAttribute('aria-label',point.title);
      marker.bindPopup(point.popup,{maxWidth:245});
      markers.set(point.key,marker);
    }
    for (const ferry of ferries) {
      L.polyline(ferry.positions,{color:'#385b83',weight:3,dashArray:'5 7',opacity:.85})
        .addTo(map).bindPopup(ferry.label);
    }
    let loadedTiles=0;
    const tiles=L.tileLayer(tileUrl,{maxZoom:19,noWrap:true,keepBuffer:1,updateWhenIdle:true});
    tiles.on('loading',()=>{
      loadedTiles=0;
      clearTimeout(tileTimer);
      tileTimer=setTimeout(fallback,8000);
    });
    tiles.on('tileload',()=>{loadedTiles++;});
    tiles.on('load',()=>{
      clearTimeout(tileTimer);
      if (!loadedTiles) {queueMicrotask(fallback);return;}
      if (ready) return;
      ready=true;
      clearTimeout(timeout);
      queueMicrotask(()=>{
        if (disposed) return;
        target.dataset.ready='true';
        onReady();
      });
    });
    tiles.addTo(map);
    map.on('moveend',()=>{
      const {lat,lng}=map.getCenter();
      onView({center:[lat,lng],zoom:map.getZoom()});
    });
  }).catch(fallback);
  return {locate,reset,destroy:cleanup};
}
