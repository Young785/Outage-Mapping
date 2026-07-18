"use client";

import { useRef } from "react";

export type CustomerInfoValue = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  notes: string;
  photos: string[];
};

type Props = {
  value: CustomerInfoValue;
  onChange: (v: CustomerInfoValue) => void;
  /** Hide name when editing an ArcGIS outage that has no customer yet (optional). */
  showName?: boolean;
  /** Max photos to keep (default 6). */
  maxPhotos?: number;
  nameRequired?: boolean;
  /** Show photo uploader (default true). */
  showPhotos?: boolean;
  /** Show notes field (default true). */
  showNotes?: boolean;
  /** Show phone field (default true). */
  showPhone?: boolean;
  /** Show email field (default true). */
  showEmail?: boolean;
  /** Place phone and email side-by-side (default false). */
  contactRow?: boolean;
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: 600,
  color: "#374151",
  marginBottom: "6px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: "14px",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  outline: "none",
  boxSizing: "border-box",
};

async function filesToDataUrls(files: FileList, max: number, existing: string[]): Promise<string[]> {
  const room = Math.max(0, max - existing.length);
  const slice = Array.from(files).slice(0, room);
  const urls = await Promise.all(
    slice.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        })
    )
  );
  return [...existing, ...urls];
}

export default function CustomerInfoFields({
  value,
  onChange,
  showName = true,
  maxPhotos = 6,
  nameRequired = false,
  showPhotos = true,
  showNotes = true,
  showPhone = true,
  showEmail = true,
  contactRow = false,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  function patch(partial: Partial<CustomerInfoValue>) {
    onChange({ ...value, ...partial });
  }

  const phoneField = showPhone ? (
    <div style={{ flex: 1, minWidth: 0 }}>
      <label style={labelStyle}>Phone Number</label>
      <input
        type="tel"
        value={value.customerPhone}
        onChange={(e) => patch({ customerPhone: e.target.value })}
        placeholder="(612) 555-0100"
        style={inputStyle}
      />
    </div>
  ) : null;

  const emailField = showEmail ? (
    <div style={{ flex: 1, minWidth: 0 }}>
      <label style={labelStyle}>Email Address</label>
      <input
        type="email"
        value={value.customerEmail}
        onChange={(e) => patch({ customerEmail: e.target.value })}
        placeholder="customer@email.com"
        style={inputStyle}
      />
    </div>
  ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {showName && (
        <div>
          <label style={labelStyle}>
            Customer Name {nameRequired && <span style={{ color: "#ef4444" }}>*</span>}
          </label>
          <input
            type="text"
            value={value.customerName}
            onChange={(e) => patch({ customerName: e.target.value })}
            required={nameRequired}
            style={inputStyle}
            placeholder="Full name or company"
          />
        </div>
      )}

      {(showPhone || showEmail) &&
        (contactRow && showPhone && showEmail ? (
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {phoneField}
            {emailField}
          </div>
        ) : (
          <>
            {phoneField}
            {emailField}
          </>
        ))}

      {showNotes && (
        <div>
          <label style={labelStyle}>Notes</label>
          <textarea
            value={value.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
            placeholder="Access instructions, special requirements…"
          />
        </div>
      )}

      {showPhotos && (
        <div>
          <label style={labelStyle}>Photos</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={async (e) => {
              const files = e.target.files;
              if (!files?.length) return;
              try {
                const next = await filesToDataUrls(files, maxPhotos, value.photos);
                patch({ photos: next });
              } catch {
                /* ignore read errors */
              }
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={value.photos.length >= maxPhotos}
            style={{
              padding: "10px 14px",
              background: "#f9fafb",
              border: "1px dashed #d1d5db",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              color: "#374151",
              cursor: value.photos.length >= maxPhotos ? "not-allowed" : "pointer",
              width: "100%",
            }}
          >
            {value.photos.length >= maxPhotos
              ? `Photo limit reached (${maxPhotos})`
              : `Add photos (${value.photos.length}/${maxPhotos})`}
          </button>
          {value.photos.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
              {value.photos.map((src, i) => (
                <div key={i} style={{ position: "relative", width: 72, height: 72 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Photo ${i + 1}`}
                    style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }}
                  />
                  <button
                    type="button"
                    onClick={() => patch({ photos: value.photos.filter((_, j) => j !== i) })}
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      border: "none",
                      background: "#111827",
                      color: "#fff",
                      fontSize: 12,
                      cursor: "pointer",
                      lineHeight: "22px",
                    }}
                    aria-label="Remove photo"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { labelStyle, inputStyle };
