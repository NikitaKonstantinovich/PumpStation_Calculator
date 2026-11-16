"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { stampedPart } from "./stamped-flanges";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { drilledFrameGeometry } from "./frame-renderer";
import { componentObject, componentRenderState, disposeObject, material, sameComponentGeometry, setMaterialOpacity, updateComponentAppearance, vector, type ComponentRenderState } from "./geometry";
import { assemblyBounds, distance, parseCameraView, type Assembly, type CameraView, type Component, type Vec3, type EditorState } from "./model";
import { noteCameraMotion } from "../project-autosave";
import { snapGeometry, workingPlane, excludedTargets, onFace, projectPlane, type SnapGeometry, type SnapLine, type SnapFace } from "./snap-geometry";
import { candidates, rankedCandidates, rayPlane, closestToRay, type Candidate, type SnapPick, type SnapQuery } from "./snap-engine";
import type { SnapSettings } from "./snap-settings";
import { InsertionRenderCache } from "./insertion-renderer";
import { CollectorRenderCache } from "./collector-renderer";

export type ViewportHandle = { fit: () => void; standard: (view: "front" | "top" | "right" | "iso") => void; prepareMeshes: (urls: string[]) => Promise<void>; cameraView: () => CameraView | undefined };
export type EditorMode = "translate" | "rotate" | "measure" | "move" | "reference1" | "between1" | "between2" | "addReference" | "parallelEdge" | "planeFace";
export type ViewportProps = {
  assembly: Assembly; selectedId: string | null; selectedPieceId?: string; grid: boolean; snapStep: number | null;
  mode: EditorMode; camera?: CameraView; cameraStorageKey?: string;
  measurement: Vec3[];
  snaps: SnapSettings; referencePoints: EditorState["referencePoints"];
  reference?: Vec3; secondReference?: Vec3; parallelLine?: SnapLine;
  referenceApproximate?: boolean; secondReferenceApproximate?: boolean;
  movingId?: string; moveHasSource?: boolean; preview?: boolean;
  onSelect: (id: string | null, pieceId?: string) => void;
  onTransform: (id: string, position: Vec3, rotation: Vec3) => void;
  onPick: (point: SnapPick) => void; onCancel: () => void;
  onLine: (line: SnapLine) => void; onPlane: (face: SnapFace) => void;
  onAssetError: (message: string) => void;
};

const visibleHierarchy = (o: THREE.Object3D): boolean => o.visible && (!o.parent || visibleHierarchy(o.parent));
const CAMERA_SAVE_DELAY_MS = 150;

class Scene {
  insertionCache = new InsertionRenderCache();
  collectorCache = new CollectorRenderCache();
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 1, 1e7);
  orbit: OrbitControls;
  transform: TransformControls;
  root = new THREE.Group();
  measurements = new THREE.Group();
  snapGuides = new THREE.Group();
  snapSelection = new THREE.Box3Helper(new THREE.Box3(), 0x20bfa6);
  snapLabel: HTMLDivElement;
  snapSymbol: HTMLSpanElement;
  snapText: HTMLSpanElement;
  geometry: SnapGeometry = { points: [], lines: [], circles: [], faces: [] };
  refs?: EditorState["referencePoints"];
  pointer?: { x: number; y: number };
  choices: Candidate[] = [];
  chosen?: Candidate;
  fallback?: SnapPick;
  hoveredLine?: SnapLine;
  hoveredFace?: SnapFace;
  selection = new THREE.Box3Helper(new THREE.Box3(), 0xf5a623);
  grid = new THREE.GridHelper(12000, 120, 0x7694a4, 0xb2c2cb);
  axes = new THREE.AxesHelper(250);
  objects = new Map<string, THREE.Group>();
  private rendered = new WeakMap<THREE.Group, ComponentRenderState>();
  private assetRetries = new WeakMap<THREE.Group, Array<() => void>>();
  cache = new Map<string, Promise<THREE.BufferGeometry>>();
  observer: ResizeObserver;
  themeObserver: MutationObserver;
  options?: ViewportProps;
  assembly?: Assembly;
  disposed = false;
  dragging = false;
  pointerStart?: { x: number; y: number };
  hasCamera = false;
  frame?: number;
  snapDirty = false;
  orbitActive = false;
  cameraDirty = false;
  cameraSaveTimer?: number;
  cleanup: Array<() => void> = [];

  constructor(host: HTMLDivElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.setAttribute("aria-label", "3D-сцена установки. Вращение: левая кнопка; перемещение: правая; масштаб: колесо.");
    canvas.tabIndex = 0;
    host.appendChild(canvas);
    this.snapLabel = document.createElement("div"); this.snapLabel.className = "snap-marker"; this.snapLabel.hidden = true; this.snapLabel.dataset.testid = "snap-marker";
    this.snapSymbol = document.createElement("span"); this.snapSymbol.className = "snap-marker__symbol";
    this.snapText = document.createElement("span"); this.snapText.className = "snap-marker__text";
    this.snapLabel.append(this.snapSymbol, this.snapText); host.appendChild(this.snapLabel);
    this.camera.up.set(0, 0, 1); this.camera.position.set(2500, -3000, 2300);
    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = false; this.orbit.minDistance = 10; this.orbit.maxDistance = 1e6;
    this.transform = new TransformControls(this.camera, canvas);
    this.transform.setSpace("world");
    this.scene.add(this.root, this.measurements, this.snapGuides, this.snapSelection, this.transform.getHelper(), this.selection, this.grid, this.axes);
    this.snapSelection.visible = false;
    this.selection.visible = false;
    this.grid.rotateX(Math.PI / 2); this.grid.position.z = -.5;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x536a7a, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(1000, -2000, 4000); this.scene.add(light);
    const fill = new THREE.DirectionalLight(0xb5d5ef, 1.5); fill.position.set(-1500, 2000, 1000); this.scene.add(fill);
    this.transform.addEventListener("dragging-changed", event => { this.dragging = Boolean(event.value); this.orbit.enabled = !event.value; this.requestSnap(); });
    this.transform.addEventListener("change", () => this.requestRender());
    this.transform.addEventListener("objectChange", () => this.highlight());
    this.transform.addEventListener("mouseUp", () => {
      const object = this.transform.object;
      if (!object) return;
      this.options?.onTransform(object.userData.componentId, object.position.toArray() as Vec3, [object.rotation.x, object.rotation.y, object.rotation.z].map(THREE.MathUtils.radToDeg) as Vec3);
    });
    this.orbit.addEventListener("start", () => { this.orbitActive = true; });
    this.orbit.addEventListener("change", () => {
      if (this.orbitActive) {
        this.cameraDirty = true;
        noteCameraMotion();
      }
      if (this.activePicking()) this.requestSnap(); else this.requestRender();
    });
    this.orbit.addEventListener("end", () => {
      this.orbitActive = false;
      // OrbitControls ends each wheel event, not the whole scroll gesture.
      if (this.cameraDirty && !this.dragging) {
        window.clearTimeout(this.cameraSaveTimer);
        this.cameraSaveTimer = window.setTimeout(() => {
          if (!this.orbitActive) this.saveCamera();
        }, CAMERA_SAVE_DELAY_MS);
      }
    });
    const down = (event: PointerEvent) => { this.pointerStart = { x: event.clientX, y: event.clientY }; canvas.focus({ preventScroll: true }); };
    const up = (event: PointerEvent) => {
      const start = this.pointerStart; this.pointerStart = undefined;
      if (!start || event.button !== 0 || this.dragging || Math.hypot(start.x - event.clientX, start.y - event.clientY) > 4 || this.transform.axis) return;
      if (this.activePicking()) {
        // Preserve Tab's choice if the pointer has not moved since cycling.
        if (!this.pointer || Math.hypot(this.pointer.x - event.clientX, this.pointer.y - event.clientY) > .5) {
          this.pointer = { x: event.clientX, y: event.clientY }; this.snapDirty = true;
        }
        if (this.snapDirty) { this.refreshSnap(); this.requestRender(); }
        if (this.options?.mode === "planeFace") { if (this.hoveredFace) this.options.onPlane(this.hoveredFace); }
        else if (this.options?.mode === "parallelEdge") { if (this.hoveredLine) this.options.onLine(this.hoveredLine); }
        else if (this.chosen || this.fallback) this.options?.onPick(this.chosen ?? this.fallback!);
        return;
      }
      const rect = canvas.getBoundingClientRect(), ray = new THREE.Raycaster();
      this.camera.updateMatrixWorld(); this.root.updateMatrixWorld();
      ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), this.camera);
      const hit = ray.intersectObjects([...this.objects.values()].filter(o => o.visible), true).find(h => h.object instanceof THREE.Mesh && visibleHierarchy(h.object));
      let object: THREE.Object3D | null = hit?.object ?? null;
      let pieceId: string | undefined;
      while (object && !object.userData.componentId) { pieceId ??= object.userData.pieceId; object = object.parent; }
      this.options?.onSelect(object?.userData.componentId ?? null, pieceId);
    };
    const move = (event: PointerEvent) => { this.pointer = { x: event.clientX, y: event.clientY }; if (!event.buttons && this.activePicking()) this.requestSnap(); };
    const leave = () => {
      this.pointer = undefined;
      if (this.activePicking()) this.requestSnap();
      // Keep the last view if the user leaves the canvas to switch tools.
      if (this.cameraDirty && !this.orbitActive && !this.dragging) this.saveCamera();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); this.options?.onCancel(); this.clearSnap(); this.requestRender(); }
      if (event.key === "Tab" && this.activePicking()) {
        if (this.snapDirty) this.refreshSnap();
        if (!this.choices.length) return;
        event.preventDefault(); event.stopPropagation();
        const index = this.choices.findIndex(c => c.id === this.chosen?.id);
        this.chosen = this.choices[(index + (event.shiftKey ? -1 : 1) + this.choices.length) % this.choices.length]; this.showSnap();
        this.requestRender();
      }
    };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerleave", leave); canvas.addEventListener("keydown", key);
    this.cleanup.push(() => { canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerleave", leave); canvas.removeEventListener("keydown", key); });
    this.observer = new ResizeObserver(() => {
      const { width, height } = host.getBoundingClientRect();
      // CSS workspace zoom changes screen bounds; use layout pixels for rendering resolution/aspect.
      const w = host.clientWidth || width, h = host.clientHeight || height;
      if (w < 1 || h < 1) return;
      this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      // Keep handles about 80 screen pixels long, also under workspace CSS zoom.
      const handlePixels = Math.min(80, Math.min(width, height) * .2);
      this.transform.setSize(handlePixels * 4 / (.95 * height));
      this.requestSnap();
    });
    this.observer.observe(host);
    const theme = () => {
      const raw = getComputedStyle(host).getPropertyValue("--theme-surface-subtle").trim();
      this.scene.background = new THREE.Color(raw || "#eff4f7");
      for (const mat of Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material]) { mat.transparent = true; mat.opacity = document.documentElement.dataset.theme === "dark" ? .23 : .55; mat.depthWrite = false; }
      this.requestRender();
    };
    this.themeObserver = new MutationObserver(theme);
    this.themeObserver.observe(document.documentElement, { attributes: true }); theme();
    const restoreContext = () => this.requestRender();
    canvas.addEventListener("webglcontextrestored", restoreContext);
    this.cleanup.push(() => canvas.removeEventListener("webglcontextrestored", restoreContext));
  }
  requestRender() {
    if (this.disposed || this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      if (this.snapDirty) this.refreshSnap();
      this.renderer.render(this.scene, this.camera);
    });
  }
  requestSnap() { this.snapDirty = true; this.requestRender(); }
  activePicking() { const options = this.options; return !!options && options.mode !== "translate" && options.mode !== "rotate" && !options.preview; }
  clearSnap() {
    this.snapDirty = false;
    this.chosen = undefined; this.fallback = undefined; this.choices = []; this.hoveredLine = undefined; this.hoveredFace = undefined;
    this.snapLabel.hidden = true; this.snapSelection.visible = false; disposeObject(this.snapGuides); this.snapGuides.clear();
  }
  refreshSnap() {
    this.snapDirty = false;
    const options = this.options, pointer = this.pointer;
    if (!options || !pointer || !this.activePicking() || this.dragging) { this.clearSnap(); return; }
    const rect = this.renderer.domElement.getBoundingClientRect(), ray = new THREE.Raycaster();
    if (!rect.width || !rect.height) { this.clearSnap(); return; }
    this.camera.updateMatrixWorld();
    ray.setFromCamera(new THREE.Vector2((pointer.x - rect.left) / rect.width * 2 - 1, -(pointer.y - rect.top) / rect.height * 2 + 1), this.camera);
    const exclude = options.mode === "move" && options.moveHasSource ? excludedTargets(options.assembly, options.movingId) : new Set<string>();
    const onlyComponent = options.mode === "move" && !options.moveHasSource ? options.movingId : undefined;
    const targets = [...this.objects.entries()].filter(([id, o]) => o.visible && !exclude.has(id) && (!onlyComponent || id === onlyComponent)).map(([, o]) => o);
    this.scene.updateMatrixWorld(true);
    const hit = ray.intersectObjects(targets, true).find(h => h.object instanceof THREE.Mesh && visibleHierarchy(h.object));
    let object: THREE.Object3D | null = hit?.object ?? null;
    while (object && !object.userData.componentId) object = object.parent;
    const surface = hit && object ? { point: hit.point.toArray() as Vec3, componentId: object.userData.componentId as string, vertices: hit.face && hit.object instanceof THREE.Mesh ? [hit.face.a, hit.face.b, hit.face.c].map(i => new THREE.Vector3().fromBufferAttribute(hit.object instanceof THREE.Mesh ? hit.object.geometry.attributes.position : null!, i).applyMatrix4(hit.object.matrixWorld).toArray() as Vec3) : [] } : undefined;
    const project = (p: Vec3) => { const v = vector(p).project(this.camera); return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height, visible: v.z >= -1 && v.z <= 1 }; };
    // A source/base point must be on the actual component, not its projected copy.
    const settings = onlyComponent ? { ...options.snaps, types: { ...options.snaps.types, project: false } } : options.snaps;
    const plane = workingPlane(settings, this.geometry);
    if (settings.enabled && settings.types.project && !plane) { this.clearSnap(); return; }
    const query: SnapQuery = { geometry: this.geometry, settings, plane, pointer, project, exclude, onlyComponent, reference: options.reference, secondReference: options.secondReference, referenceApproximate: options.referenceApproximate, secondReferenceApproximate: options.secondReferenceApproximate, parallelLine: options.parallelLine, surface, ray: { origin: ray.ray.origin.toArray() as Vec3, direction: ray.ray.direction.toArray() as Vec3 } };
    this.hoveredLine = undefined; this.hoveredFace = undefined;
    if (options.mode === "parallelEdge") {
      const nearby = this.geometry.lines.map(l => { const point = closestToRay(query.ray, l.a, l.b), s = project(point); return { line: l, point, distance: s.visible ? Math.hypot(s.x - pointer.x, s.y - pointer.y) : Infinity }; }).filter(l => l.distance <= settings.radius).sort((a, b) => a.distance - b.distance);
      this.hoveredLine = nearby[0]?.line;
      this.chosen = nearby[0] ? { id: nearby[0].line.id, point: nearby[0].point, componentId: nearby[0].line.componentId, componentIds: [nearby[0].line.componentId], kinds: ["parallel"], label: "Ребро для параллельного направления", symbol: "∥", approximate: false, projected: false, guide: [nearby[0].line.a, nearby[0].line.b] } : undefined;
      this.fallback = undefined; this.choices = []; this.showSnap(); return;
    }
    if (options.mode === "planeFace") {
      const nearby = this.geometry.faces.flatMap(face => { const point = rayPlane(query.ray, face); return point && onFace(point, face) ? [{ face, point, distance: distance(query.ray.origin, point) }] : []; }).sort((a, b) => a.distance - b.distance);
      this.hoveredFace = nearby[0]?.face;
      this.chosen = nearby[0] ? { id: nearby[0].face.id, point: nearby[0].point, componentId: nearby[0].face.componentId, componentIds: [nearby[0].face.componentId], kinds: ["faceCenter"], label: "Рабочая плоскость по грани", symbol: "▱", approximate: false, projected: false } : undefined;
      this.fallback = undefined; this.choices = []; this.showSnap(); return;
    }
    this.choices = rankedCandidates(candidates(query), project, pointer, settings.radius, this.chosen?.id);
    this.chosen = this.choices[0];
    this.fallback = undefined;
    const projection = settings.enabled && settings.types.project && !!plane;
    let point = surface?.point;
    if (!point && plane && !onlyComponent && (projection || options.snapStep)) point = rayPlane(query.ray, plane) ?? undefined;
    if (point) {
      const approximate = !!surface;
      if (projection && plane) point = projectPlane(point, plane);
      if (options.snapStep && !onlyComponent) {
        // Grid belongs to the working plane in projection mode; free 3D uses world coordinates.
        if (projection && plane) {
          const p = vector(point).sub(vector(plane.origin)), u = vector(plane.u), v = vector(plane.v), step = options.snapStep;
          point = vector(plane.origin).addScaledVector(u, Math.round(p.dot(u) / step) * step).addScaledVector(v, Math.round(p.dot(v) / step) * step).toArray() as Vec3;
        } else point = point.map(n => Math.round(n / options.snapStep!) * options.snapStep!) as Vec3;
      }
      this.fallback = { point, componentId: surface?.componentId, kinds: [], label: options.snapStep && !onlyComponent ? "Сетка" : "Точка поверхности по сетке", approximate, projected: projection };
    }
    this.showSnap();
  }
  showSnap() {
    const options = this.options!, pick = this.chosen ?? this.fallback;
    disposeObject(this.snapGuides); this.snapGuides.clear(); this.snapSelection.visible = false;
    if (!pick) { this.snapLabel.hidden = true; return; }
    const rect = this.renderer.domElement.getBoundingClientRect(), p = vector(pick.point).project(this.camera), host = this.renderer.domElement.parentElement!;
    this.snapLabel.hidden = !options.snaps.markers && !options.snaps.labels;
    this.snapLabel.style.left = `${(p.x + 1) / 2 * host.clientWidth}px`; this.snapLabel.style.top = `${(1 - p.y) / 2 * host.clientHeight}px`;
    this.snapLabel.dataset.kinds = pick.kinds.join(","); this.snapLabel.dataset.point = pick.point.join(",");
    this.snapSymbol.hidden = !options.snaps.markers; this.snapSymbol.textContent = this.chosen?.symbol ?? "+";
    this.snapText.hidden = !options.snaps.labels; this.snapText.textContent = `${pick.projected ? "Проекция · " : ""}${pick.approximate ? "≈ " : ""}${pick.label}${pick.note ? " · " + pick.note : ""}${this.choices.length > 1 ? ` · Tab ${this.choices.findIndex(c => c.id === this.chosen?.id) + 1}/${this.choices.length}` : ""}`;
    // Keep text readable near the right edge without moving the actual point marker.
    this.snapLabel.classList.toggle("snap-marker--left", (p.x + 1) / 2 * rect.width > rect.width * .6);
    const object = pick.componentId && this.objects.get(pick.componentId);
    if (object) { this.snapSelection.visible = true; this.snapSelection.box.setFromObject(object); }
    if (options.snaps.guides && this.chosen?.guide) {
      const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(this.chosen.guide.map(vector)), new THREE.LineBasicMaterial({ color: 0x14a68f, depthTest: false })); line.renderOrder = 110; this.snapGuides.add(line);
    }
  }
  cameraView(): CameraView {
    return { position: this.camera.position.toArray() as Vec3, target: this.orbit.target.toArray() as Vec3 };
  }
  saveCamera() {
    window.clearTimeout(this.cameraSaveTimer); this.cameraSaveTimer = undefined; this.cameraDirty = false;
    const key = this.options?.cameraStorageKey;
    if (key) {
      try { window.localStorage.setItem(key, JSON.stringify(this.cameraView())); }
      catch { /* The current camera still works with storage disabled. */ }
    }
  }
  initialCamera(options: ViewportProps): CameraView | undefined {
    if (options.cameraStorageKey) {
      try {
        const local = parseCameraView(JSON.parse(window.localStorage.getItem(options.cameraStorageKey) ?? "null"));
        if (local) return local;
      } catch { /* Use the camera from an imported or previously saved project. */ }
    }
    return options.camera;
  }
  fit(direction = new THREE.Vector3(1.3, -1.7, 1.2)) {
    const bounds = this.assembly && assemblyBounds(this.assembly, true);
    if (!bounds) return;
    const center = new THREE.Vector3((bounds[0] + bounds[3]) / 2, (bounds[1] + bounds[4]) / 2, (bounds[2] + bounds[5]) / 2);
    const size = Math.max(bounds[3] - bounds[0], bounds[4] - bounds[1], bounds[5] - bounds[2], 100);
    const fov = THREE.MathUtils.degToRad(this.camera.fov), extent = size / (2 * Math.tan(fov / 2)) * 1.5 / Math.min(1, this.camera.aspect);
    this.orbit.target.copy(center); this.camera.position.copy(center).add(direction.normalize().multiplyScalar(extent));
    this.camera.near = Math.max(.1, size / 10000); this.camera.far = Math.max(1e6, extent * 20);
    this.camera.updateProjectionMatrix(); this.orbit.update(); this.hasCamera = true; this.requestSnap(); this.saveCamera();
  }
  standard(view: "front" | "top" | "right" | "iso") {
    this.fit({ front: new THREE.Vector3(0, -1, 0), top: new THREE.Vector3(0, -.00001, 1), right: new THREE.Vector3(1, 0, 0), iso: new THREE.Vector3(1.3, -1.7, 1.2) }[view]);
  }
  highlight() {
    let object: THREE.Object3D | undefined = this.options?.selectedId ? this.objects.get(this.options.selectedId) : undefined;
    if (object && this.options?.selectedPieceId) object.traverse(o => { if (o.userData.pieceId === this.options?.selectedPieceId) object = o; });
    this.selection.visible = !!object && visibleHierarchy(object);
    if (object && this.selection.visible) this.selection.box.setFromObject(object);
  }
  removeComponent(id: string, object: THREE.Group) {
    if (this.transform.object === object) this.transform.detach();
    this.objects.delete(id);
    this.root.remove(object);
    disposeObject(object);
  }
  updateComponents(assembly: Assembly) {
    const removed = new Set(this.objects.keys());
    for (const c of assembly.components) {
      removed.delete(c.id);
      const next = componentRenderState(assembly, c);
      const object = this.objects.get(c.id);
      const previous = object && this.rendered.get(object);
      if (object && previous && sameComponentGeometry(previous, next)) {
        // While the gizmo is dragging, model props still contain the last
        // committed pose. Only apply a pose that actually changed in the model.
        if (c.position.some((v, i) => v !== previous.component.position[i])) object.position.fromArray(c.position);
        if (c.rotation.some((v, i) => v !== previous.component.rotation[i])) object.rotation.set(...c.rotation.map(THREE.MathUtils.degToRad) as Vec3);
        updateComponentAppearance(object, c, previous.component);
        this.rendered.set(object, next);
        const retries = this.assetRetries.get(object);
        if (retries) {
          this.assetRetries.delete(object);
          for (const retry of retries) retry();
        }
        continue;
      }
      if (object) this.removeComponent(c.id, object);
      const group = componentObject(assembly, c, this.insertionCache, this.collectorCache, next.route);
      this.objects.set(c.id, group);
      this.rendered.set(group, next);
      this.root.add(group);
      if (c.meshUrl) this.loadMesh(c, group);
      if (c.collector || c.insertion || c.shape?.kind === "mesh" || c.shape?.stampedHash) this.loadInsertionMeshes(c, group);
    }
    for (const id of removed) this.removeComponent(id, this.objects.get(id)!);
  }
  update(options: ViewportProps) {
    const geometryChanged = options.assembly !== this.assembly || options.referencePoints !== this.refs;
    this.options = options;
    if (geometryChanged) { this.geometry = snapGeometry(options.assembly, options.referencePoints); this.refs = options.referencePoints; }
    if (!this.hasCamera) {
      const camera = this.initialCamera(options);
      if (camera) {
        this.camera.position.fromArray(camera.position);
        this.orbit.target.fromArray(camera.target);
        this.orbit.update();
        this.hasCamera = true;
      }
    }
    if (options.assembly !== this.assembly) {
      this.assembly = options.assembly;
      this.updateComponents(options.assembly);
      if (!this.hasCamera) this.fit();
    }
    const selected = options.assembly.components.find(c => c.id === options.selectedId), object = selected && this.objects.get(selected.id);
    if (selected && object && !selected.locked && !selected.hidden && !selected.routing?.automatic && (options.mode === "translate" || options.mode === "rotate")) {
      if (this.transform.object !== object) this.transform.attach(object);
      this.transform.setMode(options.mode);
    } else if (this.transform.object) this.transform.detach();
    this.transform.setTranslationSnap(options.snapStep);
    this.transform.setRotationSnap(options.snapStep ? Math.PI / 36 : null);
    this.grid.visible = options.grid;
    this.highlight();
    disposeObject(this.measurements); this.measurements.clear();
    for (const point of options.measurement) {
      const marker = new THREE.Mesh(new THREE.SphereGeometry(8, 12, 8), new THREE.MeshBasicMaterial({ color: 0xe97922, depthTest: false })); marker.position.copy(vector(point)); marker.renderOrder = 100; this.measurements.add(marker);
    }
    if (options.measurement.length === 2) {
      const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(options.measurement.map(vector)), new THREE.LineBasicMaterial({ color: 0xe97922, depthTest: false })); line.renderOrder = 100; this.measurements.add(line);
    }
    this.requestSnap();
  }
  mesh(url: string) {
    if (!this.cache.has(url)) this.cache.set(url, fetch(url).then(response => {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.arrayBuffer();
    }).then(buffer => { const geometry = new STLLoader().parse(buffer); geometry.computeVertexNormals(); return geometry; }).catch(error => { this.cache.delete(url); throw error; }));
    return this.cache.get(url)!;
  }
  private loadAsset(id: string, object: THREE.Group, url: string,
    install: (geometry: THREE.BufferGeometry, current: Component) => void,
    errorMessage: (current: Component) => string) {
    const currentComponent = () => !this.disposed && this.objects.get(id) === object ? this.rendered.get(object)?.component : undefined;
    const load = () => {
      void this.mesh(url).then(geometry => {
        const current = currentComponent();
        if (current) install(geometry, current);
      }).catch(() => {
        const current = currentComponent();
        if (!current) return;
        // Try again on the next assembly update, even when the object is retained.
        const retries = this.assetRetries.get(object);
        if (retries) retries.push(load);
        else this.assetRetries.set(object, [load]);
        this.options?.onAssetError(errorMessage(current));
      });
    };
    load();
  }
  loadMesh(c: Component, object: THREE.Group) {
    this.loadAsset(c.id, object, c.meshUrl!, (geometry, current) => {
      for (const child of [...object.children]) { object.remove(child); disposeObject(child); }
      const finish = material({ ...current, opacity: 1 });
      setMaterialOpacity(finish, current.opacity);
      object.add(new THREE.Mesh(current.frameDrilling ? drilledFrameGeometry(geometry,current.frameDrilling) : geometry.clone(), finish)); this.highlight(); this.requestSnap();
    }, current => `${current.name}: не удалось загрузить CAD-копию; показаны габариты.`);
  }
  loadInsertionMeshes(c: Component, object: THREE.Group) {
    const pieces = c.collector?.template.pieces ?? c.insertion?.template.geometry.pieces ?? (c.shape ? [{ id: "line-body", name: c.name, shape: c.shape }] : []);
    for (const piece of pieces) {
      const stamped=stampedPart(piece.shape);
      const url=stamped ? `/model-assets/stamped-${stamped.sourceHash}.stl` : piece.shape.kind==="mesh" ? piece.shape.meshUrl : undefined;
      if(!url) continue;
      this.loadAsset(c.id, object, url, (geometry, current) => {
        let target: THREE.Object3D | undefined;
        object.traverse(o => { if (o.userData.pieceId === piece.id) target = o; });
        if (!target) return;
        for (const child of [...target.children]) { target.remove(child); disposeObject(child); }
        const finish = material({ ...current, opacity: 1 });
        const outline = current.line?.fidelity === "outline" && piece.id === "line-body";
        setMaterialOpacity(finish, current.opacity * (current.collector?.pieceOpacities?.[piece.id] ?? 1) * (outline ? .55 : 1));
        if (outline) finish.color.setHex(0xd1a24c);
        // The stainless backing ring is a separate part, including inside a coloured fitting.
        if(stamped){ finish.color.setHex(0xb7c2c9); finish.metalness=.55; finish.roughness=.38; }
        const mesh = new THREE.Mesh(geometry.clone(), finish);
        if(!stamped){mesh.position.fromArray(piece.shape.modelPosition ?? [0, 0, 0]); mesh.rotation.set(...(piece.shape.modelRotation ?? [0, 0, 0]).map(a => a * Math.PI / 180) as Vec3);}
        target.add(mesh); this.highlight(); this.requestSnap();
      }, () => `${piece.name}: CAD-копия недоступна; показан условный габарит, геометрия не полная.`);
    }
  }
  dispose() {
    if (this.cameraDirty) this.saveCamera();
    this.disposed = true;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    window.clearTimeout(this.cameraSaveTimer);
    this.observer.disconnect(); this.themeObserver.disconnect();
    this.cleanup.forEach(fn => fn()); this.transform.dispose(); this.orbit.dispose();
    disposeObject(this.scene);
    this.insertionCache.dispose();
    this.collectorCache.dispose();
    for (const geometry of this.cache.values()) void geometry.then(g => g.dispose()).catch(() => {});
    this.renderer.dispose(); this.renderer.domElement.remove(); this.snapLabel.remove();
  }
}

const ModelViewport = forwardRef<ViewportHandle, ViewportProps>(function ModelViewport(props, ref) {
  const host = useRef<HTMLDivElement>(null), runtime = useRef<Scene | null>(null);
  const [error, setError] = useState("");
  useImperativeHandle(ref, () => ({ fit: () => runtime.current?.fit(), standard: view => runtime.current?.standard(view), cameraView: () => runtime.current?.cameraView(),
    prepareMeshes: async urls => { const scene = runtime.current; if (scene) await Promise.all([...new Set(urls)].map(url => scene.mesh(url))); },
  }), []);
  useEffect(() => {
    if (!host.current) return;
    let scene: Scene;
    try { scene = new Scene(host.current); runtime.current = scene; }
    catch { queueMicrotask(() => setError("3D-сцена недоступна: браузеру требуется WebGL2. Дерево и числовое редактирование остаются доступны.")); return; }
    return () => { runtime.current = null; scene.dispose(); };
  }, []);
  useEffect(() => { runtime.current?.update(props); }, [props]);
  return <div className="model-editor__viewport" ref={host}>{error && <p className="model-editor__webgl-error" role="alert">{error}</p>}</div>;
});
export default ModelViewport;
