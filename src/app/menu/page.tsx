'use client'

import CartaEditorial from '@/components/CartaEditorial'

export default function MenuPublicoPage() {
  return (
    <div className="menu-publico">
      <style>{`
        .menu-publico {
          min-height: 100vh;
          background: #e9e6e0;
          padding: 24px 12px 40px;
        }
        @media (max-width: 640px) {
          .menu-publico { padding: 12px 8px 28px; }
        }
      `}</style>
      <CartaEditorial showPrices={true} />
    </div>
  )
}
