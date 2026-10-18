"use client";

import { PriceStagingModal, PriceStagingModalProps } from "./PriceStagingModal";

export type UploadPriceListModalProps = PriceStagingModalProps;

/**
 * UploadPriceListModal with Zero-Error Staging & Sync Architecture.
 * Re-exports PriceStagingModal so all upload entry points across the app
 * utilize staging review, color-coded validation, and manual override.
 */
export function UploadPriceListModal(props: PriceStagingModalProps) {
  return <PriceStagingModal {...props} />;
}

export default UploadPriceListModal;
