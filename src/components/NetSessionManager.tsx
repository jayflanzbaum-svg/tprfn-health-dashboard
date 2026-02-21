import { useState, useEffect } from 'react';
import { CalendarDays, Plus, Trash2, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface NetSession {
  id: string;
  name: string;
  started_at: string;
  ended_at: string;
  notes: string | null;
  created_at: string;
}

export function NetSessionManager() {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<NetSession[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [name, setName] = useState('Check-in Net');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');

  const fetchSessions = async () => {
    const { data, error } = await supabase
      .from('net_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(50);
    if (!error && data) setSessions(data as NetSession[]);
  };

  useEffect(() => {
    if (open) fetchSessions();
  }, [open]);

  const handleAdd = async () => {
    if (!startDate || !startTime || !endDate || !endTime) {
      toast({ title: 'Missing fields', description: 'Please fill in all date/time fields.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    const started_at = new Date(`${startDate}T${startTime}:00Z`).toISOString();
    const ended_at = new Date(`${endDate}T${endTime}:00Z`).toISOString();

    const { error } = await supabase.from('net_sessions').insert({ name, started_at, ended_at, notes: notes || null });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Net session added' });
      setName('Check-in Net');
      setStartDate('');
      setStartTime('');
      setEndDate('');
      setEndTime('');
      setNotes('');
      fetchSessions();
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('net_sessions').delete().eq('id', id);
    if (!error) {
      setSessions(prev => prev.filter(s => s.id !== id));
      toast({ title: 'Net session deleted' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-2 gap-1 border-accent/30 hover:bg-accent/10">
          <Radio className="h-3 w-3 text-accent" />
          <span className="text-xs">Nets</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-accent" />
            Check-in Net Sessions
          </DialogTitle>
        </DialogHeader>

        {/* Add form */}
        <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Log a Net Session</p>
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Check-in Net" className="h-8 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Start Date (UTC)</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Start Time (UTC)</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">End Date (UTC)</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">End Time (UTC)</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Band conditions, special events..." className="text-sm min-h-[60px]" />
          </div>
          <Button onClick={handleAdd} disabled={loading} size="sm" className="w-full gap-1">
            <Plus className="h-3 w-3" /> Add Net Session
          </Button>
        </div>

        {/* Session list */}
        <div className="space-y-2 mt-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Logged Sessions ({sessions.length})
          </p>
          {sessions.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No net sessions logged yet.</p>
          )}
          {sessions.map(s => (
            <div key={s.id} className="flex items-start gap-2 border rounded-lg p-2 bg-card text-sm">
              <CalendarDays className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(s.started_at), 'MMM d, yyyy HH:mm')} – {format(new Date(s.ended_at), 'HH:mm')} UTC
                </p>
                {s.notes && <p className="text-xs text-muted-foreground mt-0.5">{s.notes}</p>}
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => handleDelete(s.id)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
