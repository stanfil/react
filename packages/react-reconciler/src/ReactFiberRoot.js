/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactNodeList, ReactFormState} from 'shared/ReactTypes';
import type {
  FiberRoot,
  SuspenseHydrationCallbacks,
  TransitionTracingCallbacks,
} from './ReactInternalTypes';
import type {RootTag} from './ReactRootTags';
import type {Cache} from './ReactFiberCacheComponent';
import type {Container} from './ReactFiberConfig';

import {noTimeout} from './ReactFiberConfig';
import {createHostRootFiber} from './ReactFiber';
import {
  NoLane,
  NoLanes,
  NoTimestamp,
  TotalLanes,
  createLaneMap,
} from './ReactFiberLane';
import {
  enableSuspenseCallback,
  enableProfilerCommitHooks,
  enableProfilerTimer,
  enableUpdaterTracking,
  enableTransitionTracing,
  disableLegacyMode,
  enableSwipeTransition,
} from 'shared/ReactFeatureFlags';
import {initializeUpdateQueue} from './ReactFiberClassUpdateQueue';
import {LegacyRoot, ConcurrentRoot} from './ReactRootTags';
import {createCache, retainCache} from './ReactFiberCacheComponent';

export type RootState = {
  element: any,
  isDehydrated: boolean,
  cache: Cache,
};

function FiberRootNode(
  this: $FlowFixMe,
  containerInfo: any,
  // $FlowFixMe[missing-local-annot]
  tag,
  hydrate: any,
  identifierPrefix: any,
  onUncaughtError: any,
  onCaughtError: any,
  onRecoverableError: any,
  formState: ReactFormState<any, any> | null,
) {
  this.tag = disableLegacyMode ? ConcurrentRoot : tag;
  this.containerInfo = containerInfo;
  this.pendingChildren = null;
  this.current = null;
  this.pingCache = null;
  this.timeoutHandle = noTimeout;
  this.cancelPendingCommit = null;
  this.context = null;
  this.pendingContext = null;
  this.next = null;
  this.callbackNode = null;
  this.callbackPriority = NoLane;
  this.expirationTimes = createLaneMap(NoTimestamp);

  this.pendingLanes = NoLanes;
  this.suspendedLanes = NoLanes;
  this.pingedLanes = NoLanes;
  this.warmLanes = NoLanes;
  this.expiredLanes = NoLanes;
  this.errorRecoveryDisabledLanes = NoLanes;
  this.shellSuspendCounter = 0;

  this.entangledLanes = NoLanes;
  this.entanglements = createLaneMap(NoLanes);

  this.hiddenUpdates = createLaneMap(null);

  this.identifierPrefix = identifierPrefix;
  this.onUncaughtError = onUncaughtError;
  this.onCaughtError = onCaughtError;
  this.onRecoverableError = onRecoverableError;

  this.pooledCache = null;
  this.pooledCacheLanes = NoLanes;

  if (enableSuspenseCallback) {
    this.hydrationCallbacks = null;
  }

  this.formState = formState;

  if (enableSwipeTransition) {
    this.pendingGestures = null;
    this.stoppingGestures = null;
    this.gestureClone = null;
  }

  this.incompleteTransitions = new Map();
  if (enableTransitionTracing) {
    this.transitionCallbacks = null;
    const transitionLanesMap = (this.transitionLanes = []);
    for (let i = 0; i < TotalLanes; i++) {
      transitionLanesMap.push(null);
    }
  }

  if (enableProfilerTimer && enableProfilerCommitHooks) {
    this.effectDuration = -0;
    this.passiveEffectDuration = -0;
  }

  if (enableUpdaterTracking) {
    this.memoizedUpdaters = new Set();
    const pendingUpdatersLaneMap = (this.pendingUpdatersLaneMap = []);
    for (let i = 0; i < TotalLanes; i++) {
      pendingUpdatersLaneMap.push(new Set());
    }
  }

  if (__DEV__) {
    if (disableLegacyMode) {
      // TODO: This varies by each renderer.
      this._debugRootType = hydrate ? 'hydrateRoot()' : 'createRoot()';
    } else {
      switch (tag) {
        case ConcurrentRoot:
          this._debugRootType = hydrate ? 'hydrateRoot()' : 'createRoot()';
          break;
        case LegacyRoot:
          this._debugRootType = hydrate ? 'hydrate()' : 'render()';
          break;
      }
    }
  }
}
export function createFiberRoot(
  containerInfo: Container,
  tag: RootTag,
  hydrate: boolean,
  initialChildren: ReactNodeList,
  hydrationCallbacks: null | SuspenseHydrationCallbacks,
  isStrictMode: boolean,
  // TODO: We have several of these arguments that are conceptually part of the
  // host config, but because they are passed in at runtime, we have to thread
  // them through the root constructor. Perhaps we should put them all into a
  // single type, like a DynamicHostConfig that is defined by the renderer.
  identifierPrefix: string,
  onUncaughtError: (
    error: mixed,
    errorInfo: {+componentStack?: ?string},
  ) => void,
  onCaughtError: (
    error: mixed,
    errorInfo: {
      +componentStack?: ?string,
      +errorBoundary?: ?React$Component<any, any>,
    },
  ) => void,
  onRecoverableError: (
    error: mixed,
    errorInfo: {+componentStack?: ?string},
  ) => void,
  transitionCallbacks: null | TransitionTracingCallbacks,
  formState: ReactFormState<any, any> | null,
): FiberRoot {
  // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions
  // 创建FiberRootNode实例作为整个React应用的根节点
  const root: FiberRoot = (new FiberRootNode(
    containerInfo,
    tag,
    hydrate,
    identifierPrefix,
    onUncaughtError,
    onCaughtError,
    onRecoverableError,
    formState,
  ): any);

  // 如果启用了Suspense回调,设置hydrationCallbacks
  if (enableSuspenseCallback) {
    root.hydrationCallbacks = hydrationCallbacks;
  }

  // 如果启用了Transition追踪,设置transitionCallbacks
  if (enableTransitionTracing) {
    root.transitionCallbacks = transitionCallbacks;
  }

  // Cyclic construction. This cheats the type system right now because
  // stateNode is any.
  // 创建未初始化的hostRootFiber,作为FiberRoot的current指针
  const uninitializedFiber = createHostRootFiber(tag, isStrictMode);

  // 建立FiberRoot和RootFiber的关联
  root.current = uninitializedFiber;
  uninitializedFiber.stateNode = root;

  const initialCache = createCache();
  retainCache(initialCache);

  // The pooledCache is a fresh cache instance that is used temporarily
  // for newly mounted boundaries during a render. In general, the
  // pooledCache is always cleared from the root at the end of a render:
  // it is either released when render commits, or moved to an Offscreen
  // component if rendering suspends. Because the lifetime of the pooled
  // cache is distinct from the main memoizedState.cache, it must be
  // retained separately.
  root.pooledCache = initialCache;
  retainCache(initialCache);
  // 设置RootFiber的初始状态
  const initialState: RootState = {
    element: initialChildren,
    isDehydrated: hydrate,
    cache: initialCache,
  };
  uninitializedFiber.memoizedState = initialState;

  // 初始化更新队列
  initializeUpdateQueue(uninitializedFiber);

  return root;
}
