import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Send, MessageCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface SupportFormProps {
  defaultType?: 'hub_callsign' | 'station_location' | 'general';
  trigger?: React.ReactNode;
}

export function SupportForm({ defaultType = 'general', trigger }: SupportFormProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [requestType, setRequestType] = useState(defaultType);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke('submit-support', {
        body: { name, email, request_type: requestType, message },
      });

      if (error) throw error;

      toast({ title: 'Request submitted!', description: 'We\'ll get back to you soon.' });
      setOpen(false);
      setName('');
      setEmail('');
      setMessage('');
      setRequestType(defaultType);
    } catch (err: any) {
      toast({ title: 'Failed to submit', description: err.message || 'Please try again', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const defaultTrigger = (
    <Button variant="outline" size="sm" className="gap-1.5 text-xs">
      <MessageCircle className="h-3.5 w-3.5" />
      Contact Support
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contact Support</DialogTitle>
          <DialogDescription>
            Submit a request to update hub callsigns, station locations, or ask a question.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="support-name">Your Name / Callsign</Label>
            <Input
              id="support-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., John or W1ABC"
              required
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="support-email">Email</Label>
            <Input
              id="support-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              maxLength={255}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="support-type">Request Type</Label>
            <Select value={requestType} onValueChange={(v: any) => setRequestType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hub_callsign">Hub Callsign Change</SelectItem>
                <SelectItem value="station_location">Station Location Update</SelectItem>
                <SelectItem value="general">General Question</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="support-message">Message</Label>
            <Textarea
              id="support-message"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Describe what you'd like changed..."
              required
              maxLength={1000}
              rows={4}
            />
          </div>
          <Button type="submit" className="w-full gap-2" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit Request
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
