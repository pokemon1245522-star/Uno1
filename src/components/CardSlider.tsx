import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Card } from '../../shared/types';
import { UnoCard } from './UnoCard';
import { ChevronLeft, ChevronRight, Sparkles, ArrowUp } from 'lucide-react';
import { soundManager } from '../utils/audio';

interface CardSliderProps {
  cards: Card[];
  playableCardIds: string[];
  isMyTurn: boolean;
  onCardPlay: (card: Card) => void;
  onCardDragUp?: (card: Card) => void;
}

export const CardSlider: React.FC<CardSliderProps> = ({
  cards,
  playableCardIds,
  isMyTurn,
  onCardPlay,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(() => Math.floor(cards.length / 2));
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragScrollLeft, setDragScrollLeft] = useState(0);

  // Drag-up gesture state for "slide/flick up to play"
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState<number>(0);
  const touchStartY = useRef<number>(0);

  // Check scroll bounds
  const updateScrollBounds = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  useEffect(() => {
    updateScrollBounds();
    window.addEventListener('resize', updateScrollBounds);
    return () => window.removeEventListener('resize', updateScrollBounds);
  }, [cards.length, updateScrollBounds]);

  // Smooth slide step
  const slide = (direction: 'left' | 'right') => {
    const el = containerRef.current;
    if (!el) return;
    const amount = direction === 'left' ? -220 : 220;
    el.scrollBy({ left: amount, behavior: 'smooth' });
    soundManager.playClick();
  };

  // Mouse drag-to-scroll handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    setIsDragging(true);
    setDragStartX(e.pageX - el.offsetLeft);
    setDragScrollLeft(el.scrollLeft);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const el = containerRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - dragStartX) * 1.5;
    el.scrollLeft = dragScrollLeft - walk;
    updateScrollBounds();
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch handlers for flick-up to play gesture
  const handleTouchStart = (card: Card, e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    setDraggingCardId(card.id);
    setDragOffsetY(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!draggingCardId) return;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (deltaY < 0) {
      // Dragging upwards
      setDragOffsetY(Math.max(-120, deltaY));
    }
  };

  const handleTouchEnd = (card: Card) => {
    if (draggingCardId === card.id) {
      if (dragOffsetY < -50 && playableCardIds.includes(card.id) && isMyTurn) {
        // Flicked upwards! Play card!
        soundManager.playCardSnap();
        onCardPlay(card);
      }
    }
    setDraggingCardId(null);
    setDragOffsetY(0);
  };

  // Center index calculation for natural physical card fanning
  const centerIdx = Math.floor(cards.length / 2);

  return (
    <div className="relative w-full flex flex-col items-center">
      {/* Slider Left Arrow */}
      {canScrollLeft && (
        <button
          onClick={() => slide('left')}
          className="absolute -left-2 sm:left-1 top-1/2 -translate-y-1/2 z-40 p-2 sm:p-2.5 rounded-full bg-slate-900/90 hover:bg-slate-800 text-amber-300 border border-amber-400/40 shadow-2xl backdrop-blur-md transition-all hover:scale-110 active:scale-95 cursor-pointer flex items-center justify-center"
          title="Slide Left"
        >
          <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
      )}

      {/* Slider Right Arrow */}
      {canScrollRight && (
        <button
          onClick={() => slide('right')}
          className="absolute -right-2 sm:right-1 top-1/2 -translate-y-1/2 z-40 p-2 sm:p-2.5 rounded-full bg-slate-900/90 hover:bg-slate-800 text-amber-300 border border-amber-400/40 shadow-2xl backdrop-blur-md transition-all hover:scale-110 active:scale-95 cursor-pointer flex items-center justify-center"
          title="Slide Right"
        >
          <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
      )}

      {/* Scrollable Track with momentum physics */}
      <div
        ref={containerRef}
        onScroll={updateScrollBounds}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`w-full overflow-x-auto overflow-y-visible pt-10 pb-4 px-8 sm:px-14 flex items-end justify-start sm:justify-center min-h-[150px] sm:min-h-[185px] no-scrollbar scroll-smooth cursor-grab ${
          isDragging ? 'cursor-grabbing select-none' : ''
        }`}
        style={{
          perspective: '1000px',
        }}
      >
        <div className="flex items-end -space-x-5 sm:-space-x-7 py-2 px-6">
          {cards.map((card, idx) => {
            const isPlayable = playableCardIds.includes(card.id) && isMyTurn;
            const isHovered = selectedIndex === idx;
            const isBeingDragged = draggingCardId === card.id;

            // Natural realistic card fanning rotation angle (-8deg to +8deg)
            const offsetFromCenter = idx - centerIdx;
            const fanAngle = Math.max(-10, Math.min(10, offsetFromCenter * 2.2));

            return (
              <div
                key={card.id}
                onMouseEnter={() => setSelectedIndex(idx)}
                onTouchStart={(e) => handleTouchStart(card, e)}
                onTouchMove={handleTouchMove}
                onTouchEnd={() => handleTouchEnd(card)}
                className="relative group transition-all duration-300 transform-gpu"
                style={{
                  transform: isBeingDragged
                    ? `translateY(${dragOffsetY}px) scale(1.15)`
                    : undefined,
                  zIndex: isBeingDragged ? 50 : isHovered ? 40 : 10 + idx,
                }}
              >
                {/* Floating "Play / Slide Up" Action Cue */}
                {isPlayable && isHovered && (
                  <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 font-black text-[10px] whitespace-nowrap shadow-xl flex items-center gap-1 animate-bounce pointer-events-none z-50 font-['Outfit']">
                    <ArrowUp className="w-3 h-3 stroke-[3]" />
                    <span>Tap or Slide Up</span>
                  </div>
                )}

                <UnoCard
                  card={card}
                  size="md"
                  isPlayable={isPlayable}
                  isSelected={isHovered && isPlayable}
                  rotation={isBeingDragged ? 0 : fanAngle}
                  onClick={() => {
                    if (isPlayable) {
                      soundManager.playCardSnap();
                      onCardPlay(card);
                    } else {
                      soundManager.playError();
                    }
                  }}
                  className={`transition-all duration-200 ${
                    isPlayable ? 'hover:-translate-y-7 sm:hover:-translate-y-9' : 'hover:-translate-y-3'
                  }`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Position dots / Card counter */}
      {cards.length > 5 && (
        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400 font-['Outfit'] select-none">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>Slide / Swipe to browse cards</span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-300 font-semibold">{cards.length} cards in hand</span>
        </div>
      )}
    </div>
  );
};
