import type { ComponentProps } from "./types.ts";

export interface TabContainerProps extends ComponentProps {
  activeIndex?: number;
  onChange?: (index: number) => void;
}

export function TabContainer({
  id,
  className,
  style,
  activeIndex,
  onChange,
  children,
  ...rest
}: TabContainerProps) {
  return (
    <ztui-tabcontainer
      id={id}
      className={className}
      style={style}
      activeIndex={activeIndex}
      onChange={onChange}
      {...rest}
    >
      {children}
    </ztui-tabcontainer>
  );
}
