import React, {
  useState,
  useLayoutEffect,
  useRef,
  createContext,
  useContext,
  useCallback
} from 'react'
import { raf } from '@react-spring/rafz'
import { useGraph } from '../../graph'
import { is, jiggle } from '../../utils' 

const LayoutForceContext = createContext(null)

class LayoutForceState {
  constructor() {
    this.graph = null
    this.subscribedForces = {}
    this.params = {
      alpha: 1,
      alphaMin: 0.001,
      alphaDecay: 0.0227,
      alphaTarget: 0,
      velocityDecay: 0.6
    }
  }

  start(alpha = 1.0) {
    this.params.alpha = alpha
    raf(() => this.tick())
  }

  stop() { this.params.alpha = 0 }

  initNodeParams(node) {
    node.vx = 0 
    node.vy = 0
    node.vz = 0
  }

  subscribe(graph, params) {
    const { startOnReady = true, onReady, demandFrame = false } = params
    // Initialize graph for force layout 
    this.graph = graph
    const unsubscribeGraph = graph.subscribeChanges({ onAddNode: (node) => this.initNodeParams(node)})
    this.graph.adjacency.forEach((node) => this.initNodeParams(node))
    // Initialize params 
    this.params = Object.assign(this.params, { ...params, dim: graph.dim })
    raf.frameLoop = demandFrame ? 'demand' : 'always'
    startOnReady && this.start()
    onReady && onReady(this)
    return () => this.stop() && unsubscribeGraph() 
  }

  frame() { raf.advance() }

  tick(iterations = 1) {
    var { alpha, alphaMin, alphaTarget, alphaDecay, velocityDecay } = this.params
    if (alpha < alphaMin) return false 
    // We can manually tick more than one iteration if needed.
    for (var i = 0; i < iterations; i++) {
      // Update alpha
      this.params.alpha += (alphaTarget - alpha) * alphaDecay
      // Apply all forces on the graph
      for (const uid of Object.keys(this.subscribedForces))
        this.subscribedForces[uid].current(this.graph.adjacency, this.params)
      // Update graph velocities & positions
      this.graph.adjacency.forEach((node) => {
        node.x += (node.vx *= velocityDecay)
        node.y += (node.vy *= velocityDecay)
        node.z += (node.vz *= velocityDecay)
        // We don't update in-links since all nodes are iterated once.
        this.graph.updateNode(node, {}, false)
      })
    }
    return true 
  }

  subscribeForce(uid, callback) {
    this.subscribedForces[uid] = callback
    return () => delete this.subscribedForces[uid]
  }
}

export const LayoutForce = (props) => {
  const { children, ...rest } = props
  const graph = useGraph()
  const paramsRef = useRef(rest)
  const [state] = useState(() => new LayoutForceState())

  useLayoutEffect(() => void (
    !is.dequ(rest, paramsRef.current) &&
    Object.assign(paramsRef.current, rest)
  ), [rest])
  useLayoutEffect(() => state.subscribe(graph, paramsRef.current), [state, graph, paramsRef])

  return (
    <LayoutForceContext.Provider value={state}>
      {children}
    </LayoutForceContext.Provider>
  )
}

export const useLayoutForce = () => {
  const layout = useContext(LayoutForceContext)
  if (!layout) throw 'Hooks must used inside LayoutForce'
  return layout
}

let ids = 0
export const useForce = (callback) => {
  const [id] = useState(() => ids++)
  const layout = useLayoutForce()
  const callbackRef = useRef(callback) 
  useLayoutEffect(() => void (callbackRef.current = callback), [callback])
  useLayoutEffect(() => layout.subscribeForce(id, callbackRef), [layout, id, callbackRef])
}

