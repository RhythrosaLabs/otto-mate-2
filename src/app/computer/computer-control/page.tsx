import type { Metadata } from "next";
import { ComputerControlClient } from "./computer-control-client";

export const metadata: Metadata = {
  title: "Computer Control — Ottomate",
  description: "Let Claude control your Mac to complete tasks on your behalf.",
};

export default function ComputerControlPage() {
  return <ComputerControlClient />;
}
