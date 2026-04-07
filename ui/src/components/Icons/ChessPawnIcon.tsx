import { forwardRef, useImperativeHandle, useRef, useCallback } from "react";
import { motion, useAnimation, type Variants } from "framer-motion";

export interface ChessPawnIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

const HEAD_VARIANTS: Variants = {
  idle: { translateX: 0, translateY: 0, rotate: 0 },
  animate: {
    translateX: [0, -1, 1.5, -0.5, 0],
    translateY: [0, -1.5, 0.5, -1, 0],
    rotate: [0, -3, 2, -1, 0],
    transition: {
      duration: 2.4,
      ease: "easeInOut" as const,
      repeat: 0,
    },
  },
};

const BODY_VARIANTS: Variants = {
  idle: { rotate: 0 },
  animate: {
    rotate: [0, -1.5, 1, -0.5, 0],
    transition: {
      duration: 1.8,
      ease: "easeInOut" as const,
      repeat: 0,
    },
  },
};

interface ChessPawnIconProps {
  size?: number;
  className?: string;
}

export const ChessPawnIcon = forwardRef<ChessPawnIconHandle, ChessPawnIconProps>(
  ({ size = 28, className = "" }, ref) => {
    const headControls = useAnimation();
    const bodyControls = useAnimation();
    const isAnimating = useRef(false);

    const startAnimation = useCallback(async () => {
      if (isAnimating.current) return;
      isAnimating.current = true;
      await Promise.all([
        headControls.start("animate"),
        bodyControls.start("animate"),
      ]);
      isAnimating.current = false;
    }, [headControls, bodyControls]);

    const stopAnimation = useCallback(() => {
      headControls.start("idle");
      bodyControls.start("idle");
      isAnimating.current = false;
    }, [headControls, bodyControls]);

    useImperativeHandle(ref, () => ({
      startAnimation,
      stopAnimation,
    }));

    return (
      <motion.svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        className={className}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        onMouseEnter={() => startAnimation()}
        onMouseLeave={() => stopAnimation()}
        style={{ overflow: "visible" }}
      >
        {/* Body group: base + column */}
        <motion.g
          variants={BODY_VARIANTS}
          animate={bodyControls}
          initial="idle"
          style={{ originX: "24px", originY: "40px" }}
        >
          {/* Base foot */}
          <rect x="10" y="39" width="28" height="5" rx="2.5" stroke="currentColor" strokeWidth="2" fill="none" />
          {/* Base platform */}
          <rect x="13" y="34" width="22" height="6" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
          {/* Body column */}
          <path d="M 16 34 L 18 22 L 30 22 L 32 34" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
          {/* Collar */}
          <rect x="14" y="20" width="20" height="4" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
        </motion.g>

        {/* Head group: neck + crown */}
        <motion.g
          variants={HEAD_VARIANTS}
          animate={headControls}
          initial="idle"
          style={{ originX: "24px", originY: "20px" }}
        >
          {/* Neck */}
          <rect x="20" y="15" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="2" fill="none" />
          {/* Crown sphere */}
          <circle cx="24" cy="10" r="6" stroke="currentColor" strokeWidth="2" fill="none" />
        </motion.g>
      </motion.svg>
    );
  }
);

ChessPawnIcon.displayName = "ChessPawnIcon";
