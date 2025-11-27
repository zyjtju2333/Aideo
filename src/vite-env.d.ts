/// <reference types="vite/client" />

declare module "lucide-react" {
  import * as React from "react";

  export interface IconProps extends React.SVGProps<SVGSVGElement> {
    size?: number | string;
  }

  // Minimal icon component type used in this project
  export type Icon = React.FC<IconProps>;

  export const Plus: Icon;
  export const MoreHorizontal: Icon;
  export const Trash2: Icon;
  export const Archive: Icon;
  export const CheckCircle2: Icon;
  export const Circle: Icon;
  export const Bot: Icon;
  export const X: Icon;
  export const Send: Icon;
  export const Sparkles: Icon;
  export const ListTodo: Icon;
  export const Calendar: Icon;
  export const Settings: Icon;
  export const Database: Icon;
  export const Key: Icon;
  export const Save: Icon;
  export const Loader2: Icon;
  export const AlertCircle: Icon;
}
