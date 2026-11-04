import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const EDGE_EPSILON_PX = 1;

export interface TabStripOverflowState {
  hasOverflow: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

const INITIAL_OVERFLOW_STATE: TabStripOverflowState = {
  hasOverflow: false,
  canScrollLeft: false,
  canScrollRight: false,
};

export function useTabStripOverflow({
  activeKey,
  contentKey,
}: {
  activeKey: unknown;
  contentKey: unknown;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<TabStripOverflowState>(
    INITIAL_OVERFLOW_STATE,
  );
  const maxScrollLeftRef = useRef(0);
  const hasOverflowRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);

  const applyEdgeFlags = useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport === null) {
      return;
    }
    const maxScrollLeft = maxScrollLeftRef.current;
    const hasOverflow = hasOverflowRef.current;
    const isScrollable = hasOverflow && maxScrollLeft > EDGE_EPSILON_PX;
    const { scrollLeft } = viewport;
    const canScrollLeft = isScrollable && scrollLeft > EDGE_EPSILON_PX;
    const canScrollRight =
      isScrollable && scrollLeft < maxScrollLeft - EDGE_EPSILON_PX;
    setOverflow((prev) =>
      prev.hasOverflow === hasOverflow &&
      prev.canScrollLeft === canScrollLeft &&
      prev.canScrollRight === canScrollRight
        ? prev
        : { hasOverflow, canScrollLeft, canScrollRight },
    );
  }, []);

  const measureCapacity = useCallback(() => {
    const strip = stripRef.current;
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (strip === null || viewport === null || content === null) {
      return;
    }
    const hasOverflow =
      content.scrollWidth > strip.clientWidth + EDGE_EPSILON_PX;
    hasOverflowRef.current = hasOverflow;
    maxScrollLeftRef.current = hasOverflow
      ? Math.max(0, viewport.scrollWidth - viewport.clientWidth)
      : 0;
    applyEdgeFlags();
  }, [applyEdgeFlags]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) {
      return;
    }
    const handleScroll = () => {
      if (scrollFrameRef.current !== null) {
        return;
      }
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        applyEdgeFlags();
      });
    };
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    const resizeObserver = new ResizeObserver(measureCapacity);
    if (stripRef.current !== null) {
      resizeObserver.observe(stripRef.current);
    }
    resizeObserver.observe(viewport);
    if (contentRef.current !== null) {
      resizeObserver.observe(contentRef.current);
    }
    return () => {
      viewport.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [applyEdgeFlags, measureCapacity]);

  useEffect(() => {
    measureCapacity();
  }, [contentKey, measureCapacity]);

  useEffect(() => {
    void document.fonts?.ready?.then(() => measureCapacity());
  }, [measureCapacity]);

  useLayoutEffect(() => {
    activeTabRef.current?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
    });
  }, [activeKey, overflow.hasOverflow]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) {
      return;
    }
    const handleWheel = (event: WheelEvent) => {
      if (
        event.deltaY === 0 ||
        Math.abs(event.deltaX) >= Math.abs(event.deltaY)
      ) {
        return;
      }
      const maxScrollLeft = maxScrollLeftRef.current;
      if (maxScrollLeft <= EDGE_EPSILON_PX) {
        return;
      }
      const { scrollLeft } = viewport;
      const canScrollInWheelDirection =
        event.deltaY > 0
          ? scrollLeft < maxScrollLeft - EDGE_EPSILON_PX
          : scrollLeft > EDGE_EPSILON_PX;
      if (!canScrollInWheelDirection) {
        return;
      }
      viewport.scrollLeft = Math.min(
        maxScrollLeft,
        Math.max(0, scrollLeft + event.deltaY),
      );
      event.preventDefault();
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", handleWheel);
    };
  }, []);

  return {
    stripRef,
    viewportRef,
    contentRef,
    activeTabRef,
    overflow,
  };
}
