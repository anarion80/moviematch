import React, {
  memo,
  ReactNode,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import type { Media } from "../../../../types/moviematch";
import "./CardStack.css";
import { useGesture } from "react-use-gesture";
import {
  animated,
  Controller,
  ControllerUpdate,
  Spring,
} from "@react-spring/web";
import { Tr } from "./Tr";
const { abs, sign } = Math;

type Card = Media;

interface CardStackProps {
  cards: Card[];
  renderCard: (card: Card) => ReactNode;
  onCardDismissed: (card: Card, direction: "left" | "right") => void;
}

type Spring = ControllerUpdate<{
  x: number;
  y: number;
  z: number;
  opacity: number;
}>;

const INITIAL_COUNT = 5;
const YZ_SIZE = 15;
const YZ_OFFSET = -30;

interface StackItem<T> {
  id: string;
  index: number;
  controller: Controller<Spring>;
  item: T;
  removed: boolean;
}

export const useViewportWidth = (transform?: (n: number) => number) => {
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return transform ? transform(viewportWidth) : viewportWidth;
};

export const useFirstChildWidth = (transform?: (n: number) => number) => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const rect = ref.current?.firstElementChild?.getBoundingClientRect();
    if (rect) {
      setWidth(transform ? transform(rect.width) : rect.width);
    }
  }, [transform, ref]);
  return [ref, width] as const;
};

export const CardStack = memo(
  ({ cards, renderCard, onCardDismissed }: CardStackProps) => {
    const vw = useViewportWidth((n) => n / 2);
    const [elRef, ew] = useFirstChildWidth();
    const [{ items }, dispatch] = useReducer(
      function reducer(
        { items, index }: { items: StackItem<Card>[]; index: number },
        action:
          | { type: "add" }
          | {
            type: "remove";
            payload: { id: string; direction: "left" | "right" };
          }
          | { type: "finalizeRemove"; payload: { id: string } },
      ) {
        let newIndex = index;
        let newItems = items;

        switch (action.type) {
          case "add": {
            newIndex = index + 1;
            if (newIndex > cards.length) {
              return { items, index };
            }
            const [newCard] = cards.slice(index, newIndex);
            const controller = new Controller<Spring>({
              x: 0,
              y: YZ_OFFSET,
              z: YZ_OFFSET,
              opacity: 0,
            });
            newItems = [
              {
                id: newCard.id,
                item: newCard,
                index: 0,
                controller,
                removed: false,
              },
              ...items.map((item) => ({ ...item, index: item.index + 1 })),
            ];

            controller.start({ opacity: 1 });
            break;
          }
          case "remove": {
            const item = items.find((_) => _.id === action.payload.id);
            if (item) {
              const itemIndex = items.indexOf(item);
              item.controller
                .start({
                  x: (action.payload.direction === "left" ? -1 : 1) * (vw + ew),
                })
                .then(() => {
                  dispatch({
                    type: "finalizeRemove",
                    payload: { id: action.payload.id },
                  });
                  onCardDismissed(item.item, action.payload.direction);
                });

              newItems = items.map((item, i) =>
                item.id === action.payload.id ? { ...item, removed: true } : {
                  ...item,
                  index: i > itemIndex ? item.index - 1 : item.index,
                }
              );
            }
            break;
          }
          case "finalizeRemove": {
            newItems = newItems.filter((_) => _.id !== action.payload.id);
            break;
          }
        }

        for (const item of newItems) {
          item.controller.start({
            y: YZ_SIZE * item.index + YZ_OFFSET,
            z: YZ_SIZE * item.index + YZ_OFFSET,
          });
        }

        return { index: newIndex, items: newItems };
      },
      {
        items: cards.slice(0, INITIAL_COUNT).map((card, i) => ({
          id: card.id,
          index: i,
          item: card,
          controller: new Controller<Spring>({
            x: 0,
            y: i * YZ_SIZE + YZ_OFFSET,
            z: i * YZ_SIZE + YZ_OFFSET,
            opacity: 1,
          }),
          removed: false,
        })),
        index: INITIAL_COUNT,
      },
    );

    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
          const item = items.reduceRight<StackItem<Media> | null>(
            (item, _) => item || (!_.removed ? _ : null),
            null,
          );
          if (item) {
            dispatch({
              type: "remove",
              payload: {
                id: item.id,
                direction: e.code === "ArrowLeft" ? "left" : "right",
              },
            });
            dispatch({ type: "add" });
          }
        }
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }, [items]);

    const bind = useGesture(
      {
        onDrag({ args: [id], down, delta: [x], movement: [mx] }) {
          if (down) {
            const p = abs(mx / (vw + ew));
            console.log({ id, x, mx, p });
            let isAfterId = false;
            items.forEach(({ removed, index, id: _id, controller }) => {
              if (!removed) {
                if (id === _id) {
                  controller.set({
                    x: (controller.springs as any).x.get() + x,
                    opacity: 1 - p,
                  });
                  isAfterId = true;
                } else {
                  const yz = p * (isAfterId ? -YZ_SIZE : YZ_SIZE) +
                    index * YZ_SIZE +
                    YZ_OFFSET;
                  controller.set({ y: yz, z: yz });
                }
              }
            });
          }
        },
        onDragEnd({ args: [id], movement: [x], velocities: [vx] }) {
          const p = abs(x / (vw + ew));
          if (p > 0.5 || abs(vx) > 0.5) {
            console.log("remove", { id, x, p });
            dispatch({
              type: "remove",
              payload: {
                id,
                direction: sign(x) === -1 ? "left" : "right",
              },
            });
            dispatch({ type: "add" });
          } else {
            items.forEach(({ removed, index, id: _id, controller }) => {
              if (!removed) {
                if (id === _id) {
                  controller.start({ x: 0, opacity: 1 });
                } else {
                  const yz = index * YZ_SIZE + YZ_OFFSET;
                  controller.start({
                    y: yz,
                    z: yz,
                    config: { duration: 50, velocity: 1000 },
                  });
                }
              }
            });
          }
        },
      },
      { drag: { axis: "x" } },
    );

    const isEmpty = items.length === 0;

    return (
      <>
        <div className={`CardStack ${isEmpty ? "--empty" : ""}`} ref={elRef}>
          {isEmpty && (
            <p className="CardStackEmptyText">
              <Tr name="RATE_SECTION_EXHAUSTED_CARDS" />
            </p>
          )}
          {items.map((item) => {
            const { x, y, z, opacity } = item.controller.springs as any;
            return (
              <animated.div
                key={item.id}
                data-index={item.index}
                className="CardStackItem"
                style={{
                  x,
                  y,
                  z,
                  opacity: opacity.to([0.1, 0.8, 1], [0, 1, 1]),
                }}
                {...bind(item.id)}
              >
                {renderCard(item.item)}
              </animated.div>
            );
          })}
        </div>
      </>
    );
  },
  () => true,
);
