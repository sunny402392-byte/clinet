import React from 'react';
import { ArrowLeft, Share2, Info } from 'lucide-react';
import './TransferStyle.css';

const TransferDetail = ({ amount, status = 'completed', onBack }) => {
  const now = new Date();
  const formattedDate = now.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
  return (
    <div className="transfer-page">
      {/* Header */}
      {/* <header className="transfer-header">
        <ArrowLeft className="header-icon" onClick={onBack} />
        <h1>Transfer</h1>
        <Share2 className="header-icon" />
      </header> */}

      <div className="transfer-container">
        {/* Main Amount Section */}
        <section className="amount-section">
          <h2 className="main-amount">-{amount} USDT</h2>
          <p className="sub-amount">≈ ${parseFloat(amount || 0).toFixed(2)}</p>
        </section>

        {/* Info Card 1 */}
        <div className="info-card">
          <div className="info-row">
            <span className="info-label">Date</span>
            <span className="info-value">{formattedDate}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Status <Info size={14} className="label-icon" /></span>
            <span className={`info-value ${status === 'failed' ? 'status-failed' : 'status-completed'}`}>
              {status === 'failed' ? 'Failed' : 'Completed'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Recipient</span>
            <span className="info-value address-text">0x1B806EFC6c...d5806846467</span>
          </div>
        </div>

        {/* Info Card 2 (Network Details) */}
        <div className="info-card">
          <div className="info-row">
            <span className="info-label">Network fee</span>
            <div className="fee-container">
              <div className="fee-primary">
                <img src="/tron-logo.png" alt="TRX" className="fee-icon" />
                <span className="fee-fiat">$0.00</span>
              </div>
              <span className="fee-crypto">~1 TRX</span>
            </div>
          </div>
          <div className="info-row">
            <span className="info-label">Nonce</span>
            <span className="info-value">21</span>
          </div>
        </div>

        {/* External Link */}
        <div className="explorer-link">
          <a href="https://tronscan.org" target="_blank" rel="noreferrer">View on TronScan</a>
        </div>
      </div>
    </div>
  );
};

export default TransferDetail;