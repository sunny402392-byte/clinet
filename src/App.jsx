import { useState } from 'react';
import './App.css';
import TransferForm from './component/TransferForm';
import TransferDetail from './component/TransferDetail';

function App() {
  const [approved, setApproved] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferStatus, setTransferStatus] = useState('completed');

  const handleApproved = (amount, status) => {
    setTransferAmount(amount);
    setTransferStatus(status);
    setApproved(true);
  };

  return (
    <>
      {approved
        ? <TransferDetail amount={transferAmount} status={transferStatus} onBack={() => setApproved(false)} />
        : <TransferForm onApproved={handleApproved} />
      }
      
    </>
  );
}

export default App;
