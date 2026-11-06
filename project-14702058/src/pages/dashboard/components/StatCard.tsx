/**
 * Thin re-export so the dashboard (and the Applications / Interview hubs that
 * already import it here) share the ONE canonical stat card in the design
 * system. Do not add logic here — edit `@/components/base/StatCard`.
 */
export { default, type StatCardProps, type StatTone } from "@/components/base/StatCard";