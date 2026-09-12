"use client";

import type {
  ButtonHTMLAttributes,
  ComponentProps,
  HTMLAttributes,
  KeyboardEvent,
  ReactElement,
  ReactNode,
} from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as Stepperize from "@stepperize/react";
import { cn } from "../lib/utils";

type StepperOrientation = "horizontal" | "vertical";
type StepState = "active" | "completed" | "inactive" | "loading";
type StepIndicators = Partial<Record<StepState, ReactNode>>;

type StepDefinition = {
  id: string;
  title?: string;
  description?: string;
  icon?: ReactElement;
};

type StepperInstance = Stepperize.Stepper<readonly StepDefinition[]>;

interface StepperContextValue {
  stepper: StepperInstance;
  steps: StepDefinition[];
  orientation: StepperOrientation;
  configOrientation: StepperOrientation;
  responsive: boolean;
  registerTrigger: (node: HTMLButtonElement | null, remove?: boolean) => void;
  triggerNodes: HTMLButtonElement[];
  indicators: StepIndicators;
}

interface StepItemContextValue {
  step: StepDefinition;
  index: number;
  state: StepState;
  isDisabled: boolean;
  isLoading: boolean;
}

const StepperContext = createContext<StepperContextValue | undefined>(undefined);
const StepItemContext = createContext<StepItemContextValue | undefined>(undefined);

function useStepper() {
  const context = useContext(StepperContext);
  if (!context) throw new Error("useStepper must be used within a Stepper");
  return context;
}

function useStepItem() {
  const context = useContext(StepItemContext);
  if (!context) throw new Error("useStepItem must be used within a StepperItem");
  return context;
}

interface StepperProps extends HTMLAttributes<HTMLDivElement> {
  steps: StepDefinition[];
  defaultValue?: string;
  orientation?: StepperOrientation;
  responsive?: boolean;
  indicators?: StepIndicators;
  value?: string;
  onValueChange?: (value: string) => void;
}

function Stepper({
  steps,
  defaultValue,
  orientation = "horizontal",
  responsive = false,
  className,
  children,
  indicators = {},
  value,
  onValueChange,
  ...props
}: StepperProps) {
  const definition = useMemo(() => Stepperize.defineStepper(steps), [steps]);
  const stepper = definition.useStepper({
    defaultStep: defaultValue,
    step: value,
    onStepChange: (nextStep) => onValueChange?.(nextStep),
  });
  const [triggerNodes, setTriggerNodes] = useState<HTMLButtonElement[]>([]);
  const [isMdUp, setIsMdUp] = useState(true);

  useEffect(() => {
    if (!responsive) return;
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const updateViewport = () => setIsMdUp(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, [responsive]);

  const registerTrigger = useCallback((node: HTMLButtonElement | null, remove = false) => {
    setTriggerNodes((current) => {
      if (!node) return current;
      if (remove) return current.filter((trigger) => trigger !== node);
      return current.includes(node) ? current : [...current, node];
    });
  }, []);

  const effectiveOrientation = responsive && orientation === "horizontal" && !isMdUp ? "vertical" : orientation;
  const contextValue = useMemo<StepperContextValue>(
    () => ({
      stepper,
      steps,
      orientation: effectiveOrientation,
      configOrientation: orientation,
      responsive,
      registerTrigger,
      triggerNodes,
      indicators,
    }),
    [stepper, steps, effectiveOrientation, orientation, responsive, registerTrigger, triggerNodes, indicators],
  );

  return (
    <StepperContext.Provider value={contextValue}>
      <div
        aria-orientation={effectiveOrientation}
        className={cn("w-full", className)}
        data-orientation={effectiveOrientation}
        data-slot="stepper"
        role="tablist"
        {...props}
      >
        {children}
      </div>
    </StepperContext.Provider>
  );
}

interface StepperItemProps extends HTMLAttributes<HTMLDivElement> {
  stepId: string;
  completed?: boolean;
  disabled?: boolean;
  loading?: boolean;
}

function StepperItem({
  stepId,
  completed = false,
  disabled = false,
  loading = false,
  className,
  children,
  ...props
}: StepperItemProps) {
  const { stepper, steps } = useStepper();
  const stepIndex = steps.findIndex((step) => step.id === stepId);
  const step = steps[stepIndex];
  if (!step) throw new Error(`Unknown step: ${stepId}`);
  const state: StepState =
    completed || stepIndex < stepper.index ? "completed" : stepIndex === stepper.index ? "active" : "inactive";
  const isLoading = loading && state === "active";

  return (
    <StepItemContext.Provider value={{ step, index: stepIndex, state, isDisabled: disabled, isLoading }}>
      <div
        className={cn(
          "group/step flex items-center justify-center not-last:flex-1 group-data-[orientation=horizontal]/stepper-nav:flex-row group-data-[orientation=vertical]/stepper-nav:flex-col",
          className,
        )}
        data-loading={isLoading || undefined}
        data-slot="stepper-item"
        data-state={state}
        {...props}
      >
        {children}
      </div>
    </StepItemContext.Provider>
  );
}

interface StepperTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

function StepperTrigger({ asChild = false, className, children, tabIndex, ...props }: StepperTriggerProps) {
  const { state, isLoading, step, isDisabled } = useStepItem();
  const { stepper, registerTrigger, triggerNodes } = useStepper();
  const isSelected = stepper.id === step.id;
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useCallback(
    (node: HTMLButtonElement | null) => {
      if (node) {
        buttonRef.current = node;
        registerTrigger(node);
      } else if (buttonRef.current) {
        registerTrigger(buttonRef.current, true);
        buttonRef.current = null;
      }
    },
    [registerTrigger],
  );
  const triggerIndex = triggerNodes.findIndex((node) => node === buttonRef.current);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const previousIndex = (triggerIndex - 1 + triggerNodes.length) % triggerNodes.length;
    const nextIndex = (triggerIndex + 1) % triggerNodes.length;
    if (["ArrowRight", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      triggerNodes[nextIndex]?.focus();
    } else if (["ArrowLeft", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      triggerNodes[previousIndex]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      (event.key === "Home" ? triggerNodes[0] : triggerNodes.at(-1))?.focus();
    }
  }

  if (asChild) {
    return (
      <span className={className} data-slot="stepper-trigger" data-state={state}>
        {children}
      </span>
    );
  }

  return (
    <button
      aria-controls={`stepper-panel-${step.id}`}
      aria-selected={isSelected}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2.5 rounded-full outline-none disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
      data-loading={isLoading}
      data-slot="stepper-trigger"
      data-state={state}
      disabled={isDisabled}
      id={`stepper-tab-${step.id}`}
      onClick={() => void stepper.goTo(step.id)}
      onKeyDown={handleKeyDown}
      ref={triggerRef}
      role="tab"
      tabIndex={typeof tabIndex === "number" ? tabIndex : isSelected ? 0 : -1}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

interface StepperIndicatorProps extends ComponentProps<"div"> {
  variant?: "default" | "outline";
}

function StepperIndicator({ children, className, variant = "default" }: StepperIndicatorProps) {
  const { state, isLoading, step } = useStepItem();
  const { indicators } = useStepper();
  return (
    <div
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md text-sm font-medium transition-all duration-300",
        variant === "default"
          ? "border border-parcelis-border bg-parcelis-porcelain text-parcelis-gray group-data-[state=active]/step:border-parcelis-green group-data-[state=active]/step:bg-parcelis-green group-data-[state=active]/step:text-white group-data-[state=active]/step:ring-2 group-data-[state=active]/step:ring-parcelis-green/25 group-data-[state=completed]/step:border-parcelis-green group-data-[state=completed]/step:bg-parcelis-green group-data-[state=completed]/step:text-white"
          : "border border-parcelis-border bg-transparent text-parcelis-gray group-data-[state=active]/step:border-parcelis-green group-data-[state=active]/step:text-parcelis-charcoal group-data-[state=completed]/step:border-parcelis-charcoal group-data-[state=completed]/step:text-parcelis-charcoal",
        className,
      )}
      data-slot="stepper-indicator"
      data-state={state}
    >
      {(isLoading ? indicators.loading : indicators[state]) ??
        (step.icon ? <span className="*:[svg]:size-4">{step.icon}</span> : children)}
    </div>
  );
}

function StepperSeparator({ className }: ComponentProps<"div">) {
  const { state } = useStepItem();
  return (
    <div
      className={cn(
        "m-2 rounded-sm bg-parcelis-border transition-colors duration-500 group-data-[state=completed]/step:bg-parcelis-green group-data-[orientation=horizontal]/stepper-nav:h-0.5 group-data-[orientation=horizontal]/stepper-nav:flex-1 group-data-[orientation=vertical]/stepper-nav:h-10 group-data-[orientation=vertical]/stepper-nav:w-0.5",
        className,
      )}
      data-slot="stepper-separator"
      data-state={state}
    />
  );
}

function StepperTitle({ children, className }: ComponentProps<"h3">) {
  const { state } = useStepItem();
  return (
    <h3 className={cn("text-sm font-medium", className)} data-slot="stepper-title" data-state={state}>
      {children}
    </h3>
  );
}

function StepperDescription({ children, className }: ComponentProps<"div">) {
  const { state } = useStepItem();
  return (
    <div
      className={cn("text-xs font-medium text-parcelis-gray", className)}
      data-slot="stepper-description"
      data-state={state}
    >
      {children}
    </div>
  );
}

function StepperNav({ children, className }: ComponentProps<"nav">) {
  const { stepper, orientation, configOrientation, responsive } = useStepper();
  return (
    <nav
      className={cn(
        "group/stepper-nav inline-flex data-[orientation=horizontal]:w-full data-[orientation=horizontal]:flex-row data-[orientation=vertical]:flex-col",
        responsive && configOrientation === "horizontal" && "flex-col md:w-full md:flex-row",
        className,
      )}
      data-orientation={orientation}
      data-slot="stepper-nav"
      data-state={stepper.id}
    >
      {children}
    </nav>
  );
}

function StepperPanel({ children, className }: ComponentProps<"div">) {
  const { stepper } = useStepper();
  return (
    <div className={cn("w-full", className)} data-slot="stepper-panel" data-state={stepper.id}>
      {children}
    </div>
  );
}

interface StepperContentProps extends ComponentProps<"div"> {
  value: string;
  forceMount?: boolean;
}

function StepperContent({ value, forceMount, children, className, ...props }: StepperContentProps) {
  const { stepper } = useStepper();
  const isActive = value === stepper.id;
  if (!forceMount && !isActive) return null;
  return (
    <div
      aria-labelledby={`stepper-tab-${value}`}
      className={cn("w-full", className, !isActive && forceMount && "hidden")}
      data-slot="stepper-content"
      data-state={stepper.id}
      hidden={!isActive && forceMount}
      id={`stepper-panel-${value}`}
      role="tabpanel"
      {...props}
    >
      {children}
    </div>
  );
}

export {
  Stepper,
  StepperContent,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperPanel,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
  useStepItem,
  useStepper,
  type StepperContentProps,
  type StepperItemProps,
  type StepperProps,
  type StepperTriggerProps,
};
