import styles from "./Form.module.css";

export type ButtonVariant = "primary" | "ghost" | "danger";

/**
 * The shared button class string.
 *
 * Kept out of Form.tsx on purpose: that module is `"use client"`, and a plain
 * function exported from a client module cannot be *called* by a server
 * component. Server-rendered links and buttons import it from here.
 */
export const buttonClass = (
  variant: ButtonVariant = "primary",
  opts: { block?: boolean; small?: boolean } = {},
) =>
  [
    styles.button,
    styles[variant],
    opts.block ? styles.block : "",
    opts.small ? styles.small : "",
  ]
    .filter(Boolean)
    .join(" ");
