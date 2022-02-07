import React, {
  forwardRef,
  HTMLAttributes,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { DataSet } from 'vis-data';
import {
  Network,
  Edge,
  Node,
  Options,
  NetworkEvents,
  IdType,
} from 'vis-network';
import {
  differenceWith,
  intersectionWith,
  isEqual,
  defaultsDeep,
  cloneDeep,
} from 'lodash';

import 'vis-network/styles/vis-network.css';

export type { Network, Edge, Node, Options, NetworkEvents, IdType };

export type GraphEvents = Partial<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Record<NetworkEvents, (params?: any) => void>
>;

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

export interface NetworkGraphProps {
  graph: GraphData;
  options?: Options;
  events?: GraphEvents;
  style?: React.CSSProperties;
  className?: string;
}
/**
 * Keeps the value the same permanently.
 * Useful over refs especially in instances where the function creation variant is used
 */
function useSealedState<T>(value: T | (() => T)) {
  const [state] = useState(value);
  return state;
}

/**
 * https://github.com/crubier/react-graph-vis/commit/68bf2e27b2046d6c0bb8b334c2cf974d23443264
 */
function diff<T extends { id?: IdType }>(
  from: T[],
  to: T[],
  field: keyof T = 'id'
) {
  function accessor(item: T) {
    return item[field];
  }
  const nextIds = new Set(to.map(accessor));
  const prevIds = new Set(from.map(accessor));
  const removed = from.filter((item) => !nextIds.has(accessor(item)));

  const unchanged = intersectionWith(from, to, isEqual);

  const updated = differenceWith(
    intersectionWith(to, from, (a, b) => accessor(a) === accessor(b)),
    unchanged,
    isEqual
  );

  const added = to.filter((item) => !prevIds.has(accessor(item)));
  return {
    removed,
    unchanged,
    updated,
    added,
  };
}

const defaultOptions = {
  physics: {
    stabilization: false,
  },
  autoResize: false,
  edges: {
    smooth: false,
    color: '#000000',
    width: 0.5,
    arrows: {
      to: {
        enabled: true,
        scaleFactor: 0.5,
      },
    },
  },
};

function useResizeObserver(
  ref: React.MutableRefObject<HTMLElement | null>,
  callback: ResizeObserverCallback
): void {
  useEffect(() => {
    // Create an observer instance linked to the callback function
    if (ref.current) {
      const observer = new ResizeObserver(callback);

      // Start observing the target node for configured mutations
      observer.observe(ref.current);

      return () => {
        observer.disconnect();
      };
    }
    return;
  }, [callback, ref]);
}
function shallowClone<T>(array: T[]): T[] {
  return array.map((value) => ({ ...value }));
}
const VisGraph = forwardRef<
  Network | undefined,
  NetworkGraphProps & HTMLAttributes<HTMLDivElement>
>(({ graph, events, options: propOptions, ...props }, ref) => {
  const container = useRef<HTMLDivElement>(null);
  const edges = useSealedState(() => new DataSet<Edge>(graph.edges));
  const nodes = useSealedState(() => new DataSet<Node>(graph.nodes));
  const initialOptions = useSealedState(propOptions);

  const prevNodes = useRef(graph.nodes);
  const prevEdges = useRef(graph.edges);
  useEffect(() => {
    if (isEqual(graph.nodes, prevNodes.current)) {
      return; // No change!
    }
    const { added, removed, updated } = diff(prevNodes.current, graph.nodes);

    if (removed.length) {
      nodes.remove(removed);
    }
    // Shallow clone nodes to ensure props aren't mutated!
    if (added.length) {
      nodes.add(shallowClone(added));
    }
    if (updated.length) {
      nodes.update(shallowClone(updated));
    }
    prevNodes.current = nodes.get();
  }, [graph.nodes, nodes]);

  useEffect(() => {
    if (isEqual(graph.edges, prevEdges.current)) {
      return; // No change!
    }
    const { added, removed, updated } = diff(prevEdges.current, graph.edges);
    if (removed.length) {
      edges.remove(removed);
    }
    // Shallow clone edges to ensure props aren't mutated!
    if (added.length) {
      edges.add(shallowClone(added));
    }
    if (updated.length) {
      edges.update(shallowClone(updated));
    }
    prevEdges.current = edges.get();
  }, [graph.edges, edges]);
  const [network, setNetwork] = useState<Network>();

  useImperativeHandle(ref, () => network, [network]);

  useEffect(() => {
    if (!network || !events) {
      return () => {};
    }
    // Add user provied events to network
    for (const [eventName, callback] of Object.entries(events)) {
      if (callback) {
        network.on(eventName as NetworkEvents, callback);
      }
    }
    return () => {
      for (const [eventName, callback] of Object.entries(events)) {
        if (callback) {
          network.off(eventName as NetworkEvents, callback);
        }
      }
    };
  }, [events, network]);

  useEffect(() => {
    if (!network || !propOptions) {
      return;
    }
    try {
      network.setOptions(propOptions);
    } catch (error) {
      // Throws when it hot reloads... Yay
      if (process.env.NODE_ENV !== 'development') {
        // Still throw it in prod where there's no hot reload
        throw error;
      }
    }
  }, [network, propOptions]);

  useEffect(() => {
    // Creating the network has to be done in a useEffect because it needs access to a ref

    // merge user provied options with our default ones
    // defaultsDeep mutates the host object
    const mergedOptions = defaultsDeep(
      cloneDeep(initialOptions),
      defaultOptions
    );
    const newNetwork = new Network(
      container.current as HTMLElement,
      { edges, nodes },
      mergedOptions
    );
    setNetwork(newNetwork);
    return () => {
      // Cleanup the network on component unmount
      newNetwork.destroy();
    };
  }, [edges, initialOptions, nodes]);

  //resize network on window resize
  function onContainerResize() {
    if (network) {
      network.redraw();
    }
  }

  useResizeObserver(container, onContainerResize);

  return (
    <div style={{ width: '100%', height: '100%' }} ref={container} {...props} />
  );
});

export default VisGraph;
