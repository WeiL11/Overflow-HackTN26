import { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface ExpiryCountdownProps {
  expiryTime: string;
}

const getTimeRemaining = (expiry: string) => {
  const diff = new Date(expiry).getTime() - Date.now();
  if (diff <= 0) return { expired: true, text: 'Expired', hours: 0, minutes: 0 };

  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  let text = '';
  if (days > 0) text = `${days}d ${hours}h left`;
  else if (hours > 0) text = `${hours}h ${minutes}m left`;
  else text = `${minutes}m left`;

  return { expired: false, text, hours: days * 24 + hours, minutes: totalMinutes };
}

const ExpiryCountdown = ({ expiryTime }: ExpiryCountdownProps) => {
  const [remaining, setRemaining] = useState(() => getTimeRemaining(expiryTime));

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(getTimeRemaining(expiryTime));
    }, 60000); // update every minute
    return () => clearInterval(interval);
  }, [expiryTime]);

  if (remaining.expired) {
    return (
      <span className="flex items-center gap-1 text-destructive font-medium">
        <AlertTriangle className="h-3.5 w-3.5" />Expired
      </span>
    );
  }

  const isUrgent = remaining.minutes < 120; // less than 2 hours

  return (
    <span className={`flex items-center gap-1 font-medium ${isUrgent ? 'text-accent-foreground' : 'text-muted-foreground'}`}>
      <Clock className={`h-3.5 w-3.5 ${isUrgent ? 'text-accent' : ''}`} />
      {remaining.text}
    </span>
  );
};

export default ExpiryCountdown;
