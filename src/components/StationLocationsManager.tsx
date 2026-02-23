import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, RefreshCw, Edit2, Save, X, Loader2, Clock, Lock, Plus } from 'lucide-react';
import { StationLocation, useStationLocations } from '@/hooks/useStationLocations';
import { usePollingCallsigns } from '@/hooks/usePollingCallsigns';
import { toast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { formatDistanceToNow } from 'date-fns';
import { gridToLatLng, latLngToGrid, isValidGrid } from '@/lib/gridSquare';
import { useAuth } from '@/hooks/useAuth';
import { SupportForm } from '@/components/SupportForm';

interface StationLocationsManagerProps {
  callsigns: string[];
  activeStations?: Set<string>;
  onHubAdded?: (callsign: string) => void;
}

export function StationLocationsManager({ callsigns, activeStations, onHubAdded }: StationLocationsManagerProps) {
  const { user } = useAuth();
  const { locations, loading, lookupCallsigns, updateLocation, pauseStation, resumeStation } = useStationLocations();
  const { pollingCallsigns, loading: pollingLoading, addPollingStation } = usePollingCallsigns(callsigns, activeStations);
  const [isOpen, setIsOpen] = useState(false);
  const [editingCallsign, setEditingCallsign] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ grid_square: '', latitude: '', longitude: '' });
  const [togglingPause, setTogglingPause] = useState<string | null>(null);
  const [pausePopoverOpen, setPausePopoverOpen] = useState<string | null>(null);
  const [pauseDays, setPauseDays] = useState<string>('7');
  const [activeTab, setActiveTab] = useState('hubs');
  const [newStationCallsign, setNewStationCallsign] = useState('');
  const [addingStation, setAddingStation] = useState(false);
  const [lastCheckins, setLastCheckins] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!isOpen) return;
    const fetchLastCheckins = async () => {
      try {
        const { data: hubData } = await supabase
          .from('syslog_entries')
          .select('callsign, timestamp')
          .in('callsign', callsigns.map(c => c.toUpperCase()))
          .order('timestamp', { ascending: false });

        const { data: pollingData } = await supabase
          .from('syslog_entries')
          .select('remote_callsign, timestamp')
          .in('remote_callsign', pollingCallsigns.map(c => c.toUpperCase()))
          .order('timestamp', { ascending: false });

        const checkinMap = new Map<string, string>();
        (hubData || []).forEach(row => {
          const cs = row.callsign.toUpperCase();
          if (!checkinMap.has(cs)) checkinMap.set(cs, row.timestamp);
        });
        (pollingData || []).forEach(row => {
          if (!row.remote_callsign) return;
          const cs = row.remote_callsign.toUpperCase();
          if (!checkinMap.has(cs)) checkinMap.set(cs, row.timestamp);
        });
        setLastCheckins(checkinMap);
      } catch (err) {
        console.error('Error fetching last check-ins:', err);
      }
    };
    fetchLastCheckins();
  }, [isOpen, callsigns, pollingCallsigns]);

  const handleAddStation = async () => {
    const callsign = newStationCallsign.toUpperCase().trim();
    if (!callsign) {
      toast({ title: 'Please enter a callsign', variant: 'destructive' });
      return;
    }
    if (!/^[A-Z0-9]{3,7}$/.test(callsign)) {
      toast({ title: 'Invalid callsign format', description: 'Callsign should be 3-7 alphanumeric characters', variant: 'destructive' });
      return;
    }
    // Check if already in the current tab's visible list
    const currentList = activeTab === 'hubs' ? callsigns : pollingCallsigns;
    if (currentList.includes(callsign)) {
      toast({ title: 'Station already in this list', variant: 'destructive' });
      return;
    }
    setAddingStation(true);
    try {
      await lookupCallsigns([callsign]);
      // If on Hubs tab, also add to the hub callsigns whitelist
      if (activeTab === 'hubs' && onHubAdded) {
        onHubAdded(callsign);
      }
      // If on Polling tab, add to the manually-tracked polling list
      if (activeTab === 'polling') {
        addPollingStation(callsign);
      }
      setNewStationCallsign('');
      const stationType = activeTab === 'hubs' ? 'hub' : 'polling';
      toast({ title: `Added ${callsign}`, description: `Station added as ${stationType} and location looked up from HamQTH` });
    } catch (err) {
      toast({ title: 'Failed to add station', variant: 'destructive' });
    } finally {
      setAddingStation(false);
    }
  };

  const handleLookupAll = async (stationList: string[]) => {
    try {
      await lookupCallsigns(stationList);
      toast({
        title: 'Locations updated',
        description: `Looked up ${stationList.length} callsigns from HamQTH`,
      });
    } catch (err) {
      toast({
        title: 'Lookup failed',
        description: 'Failed to fetch some callsign locations',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (callsign: string) => {
    const loc = locations.get(callsign.toUpperCase());
    setEditingCallsign(callsign);
    setEditForm({
      grid_square: loc?.grid_square || '',
      latitude: loc?.latitude?.toString() || '',
      longitude: loc?.longitude?.toString() || '',
    });
  };

  const handleGridChange = (value: string) => {
    setEditForm(f => {
      const updated = { ...f, grid_square: value };
      if (isValidGrid(value)) {
        const coords = gridToLatLng(value);
        if (coords) {
          updated.latitude = coords.lat.toString();
          updated.longitude = coords.lng.toString();
        }
      }
      return updated;
    });
  };

  const handleLatLngChange = (field: 'latitude' | 'longitude', value: string) => {
    setEditForm(f => {
      const updated = { ...f, [field]: value };
      const lat = parseFloat(field === 'latitude' ? value : f.latitude);
      const lng = parseFloat(field === 'longitude' ? value : f.longitude);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        updated.grid_square = latLngToGrid(lat, lng);
      }
      return updated;
    });
  };

  const handleSave = async () => {
    if (!editingCallsign) return;
    try {
      await updateLocation(editingCallsign, {
        grid_square: editForm.grid_square || null,
        latitude: editForm.latitude ? parseFloat(editForm.latitude) : null,
        longitude: editForm.longitude ? parseFloat(editForm.longitude) : null,
      });
      setEditingCallsign(null);
      toast({ title: 'Location saved', description: `Updated location for ${editingCallsign}` });
    } catch (err) {
      toast({ title: 'Save failed', description: 'Failed to save location', variant: 'destructive' });
    }
  };

  const handleCancel = () => {
    setEditingCallsign(null);
    setEditForm({ grid_square: '', latitude: '', longitude: '' });
  };

  const handlePause = async (callsign: string, days: number) => {
    setTogglingPause(callsign);
    setPausePopoverOpen(null);
    try {
      await pauseStation(callsign, days);
      const durationText = days === 0 ? 'indefinitely' : `for ${days} day${days > 1 ? 's' : ''}`;
      toast({ title: 'Station paused', description: `${callsign} paused ${durationText}` });
    } catch (err) {
      toast({ title: 'Failed to pause', description: 'Could not pause station', variant: 'destructive' });
    } finally {
      setTogglingPause(null);
    }
  };

  const handleResume = async (callsign: string) => {
    setTogglingPause(callsign);
    try {
      await resumeStation(callsign);
      toast({ title: 'Station resumed', description: `${callsign} will now be included in inactive alerts` });
    } catch (err) {
      toast({ title: 'Failed to resume', description: 'Could not resume station', variant: 'destructive' });
    } finally {
      setTogglingPause(null);
    }
  };

  const renderStationTable = (stationList: string[], tabType: 'hub' | 'polling') => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Callsign</TableHead>
            <TableHead>Grid Square</TableHead>
            <TableHead>Lat/Long</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Last Check-in</TableHead>
            {tabType === 'hub' && <TableHead className="text-center">Active</TableHead>}
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stationList.length === 0 && (
            <TableRow>
              <TableCell colSpan={tabType === 'hub' ? 8 : 7} className="text-center text-muted-foreground py-8">
                {tabType === 'polling' && pollingLoading ? 'Loading polling stations...' : 'No stations found'}
              </TableCell>
            </TableRow>
          )}
          {stationList.map(callsign => {
            const loc = locations.get(callsign.toUpperCase());
            const isEditing = editingCallsign === callsign;

            return (
              <TableRow key={callsign}>
                <TableCell className="font-mono font-medium">{callsign}</TableCell>
                <TableCell>
                  {isEditing ? (
                    <Input
                      value={editForm.grid_square}
                      onChange={e => handleGridChange(e.target.value)}
                      placeholder="e.g., FN42ab"
                      className="w-24 h-8"
                    />
                  ) : (
                    loc?.grid_square || <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <div className="flex gap-1">
                      <Input
                        value={editForm.latitude}
                        onChange={e => handleLatLngChange('latitude', e.target.value)}
                        placeholder="Lat"
                        className="w-20 h-8"
                        type="number"
                        step="0.0001"
                      />
                      <Input
                        value={editForm.longitude}
                        onChange={e => handleLatLngChange('longitude', e.target.value)}
                        placeholder="Long"
                        className="w-20 h-8"
                        type="number"
                        step="0.0001"
                      />
                    </div>
                  ) : loc?.latitude && loc?.longitude ? (
                    <span className="text-xs">
                      {loc.latitude.toFixed(2)}, {loc.longitude.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {[loc?.city, loc?.state, loc?.country].filter(Boolean).join(', ') || '—'}
                </TableCell>
                <TableCell>
                  {loc?.is_manual_override ? (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Manual</span>
                  ) : loc?.source ? (
                    <span className="text-xs bg-muted px-2 py-0.5 rounded">{loc.source}</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">Not set</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {lastCheckins.has(callsign.toUpperCase()) ? (
                    <span title={new Date(lastCheckins.get(callsign.toUpperCase())!).toUTCString()}>
                      {formatDistanceToNow(new Date(lastCheckins.get(callsign.toUpperCase())!), { addSuffix: true })}
                    </span>
                  ) : (
                    <span>—</span>
                  )}
                </TableCell>
                {tabType === 'hub' && (
                  <TableCell className="text-center">
                    {user ? (
                      <div className="flex items-center justify-center gap-2">
                        {togglingPause === callsign ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : loc?.is_paused ? (
                          <div className="flex flex-col items-center gap-1">
                            <Switch
                              checked={false}
                              onCheckedChange={() => handleResume(callsign)}
                              title="Station is paused - click to resume"
                            />
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {loc.resume_at ? (
                                <span>Resumes {formatDistanceToNow(new Date(loc.resume_at), { addSuffix: true })}</span>
                              ) : (
                                <span>Paused indefinitely</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <Popover
                            open={pausePopoverOpen === callsign}
                            onOpenChange={(open) => setPausePopoverOpen(open ? callsign : null)}
                          >
                            <PopoverTrigger asChild>
                              <div>
                                <Switch
                                  checked={true}
                                  onCheckedChange={() => setPausePopoverOpen(callsign)}
                                  title="Station is active - click to pause"
                                  className="data-[state=checked]:bg-green-500"
                                />
                              </div>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-3" align="center">
                              <div className="space-y-3">
                                <p className="text-sm font-medium">Pause for how many days?</p>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={30}
                                    value={pauseDays}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === '' || (parseInt(val) >= 1 && parseInt(val) <= 30)) {
                                        setPauseDays(val);
                                      }
                                    }}
                                    className="w-20 h-8"
                                    placeholder="1-30"
                                  />
                                  <span className="text-sm text-muted-foreground">days</span>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => {
                                      const days = parseInt(pauseDays) || 7;
                                      handlePause(callsign, Math.min(30, Math.max(1, days)));
                                    }}
                                    disabled={!pauseDays || parseInt(pauseDays) < 1 || parseInt(pauseDays) > 30}
                                  >
                                    Pause
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setPausePopoverOpen(null)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{loc?.is_paused ? 'Paused' : 'Active'}</span>
                    )}
                  </TableCell>
                )}
                <TableCell>
                  {user ? (
                    isEditing ? (
                      <div className="flex gap-1">
                        <Button variant="default" size="sm" className="h-7 gap-1 text-xs" onClick={handleSave}>
                          <Save className="h-3.5 w-3.5" />
                          Save
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancel}>
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(callsign)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <MapPin className="h-4 w-4" />
          Station Locations
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Station Locations</DialogTitle>
          <DialogDescription>
            Manage station locations for distance calculations. Locations are fetched from HamQTH or can be manually entered.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="hubs" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="hubs" className="flex-1">
              Hubs ({callsigns.length})
            </TabsTrigger>
            <TabsTrigger value="polling" className="flex-1">
              Polling ({pollingLoading ? '...' : pollingCallsigns.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="hubs" className="mt-4">
            <div className="flex justify-between gap-2 mb-4 flex-wrap">
              {user && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Add callsign (e.g., W1ABC)"
                    value={newStationCallsign}
                    onChange={(e) => setNewStationCallsign(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddStation()}
                    className="w-48 font-mono uppercase"
                    maxLength={7}
                  />
                  <Button onClick={handleAddStation} disabled={addingStation} size="sm" className="gap-1">
                    {addingStation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                {!user && (
                  <SupportForm
                    defaultType="station_location"
                    trigger={
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Lock className="h-3.5 w-3.5" />
                        Request Location Change
                      </Button>
                    }
                  />
                )}
                {user && (
                  <Button onClick={() => handleLookupAll(callsigns)} disabled={loading} size="sm" className="gap-2">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Fetch All from HamQTH
                  </Button>
                )}
              </div>
            </div>
            {renderStationTable([...callsigns].sort(), 'hub')}
          </TabsContent>

          <TabsContent value="polling" className="mt-4">
            <div className="flex justify-between gap-2 mb-4 flex-wrap">
              {user && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Add callsign (e.g., W1ABC)"
                    value={newStationCallsign}
                    onChange={(e) => setNewStationCallsign(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddStation()}
                    className="w-48 font-mono uppercase"
                    maxLength={7}
                  />
                  <Button onClick={handleAddStation} disabled={addingStation} size="sm" className="gap-1">
                    {addingStation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                {!user && (
                  <SupportForm
                    defaultType="station_location"
                    trigger={
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Lock className="h-3.5 w-3.5" />
                        Request Location Change
                      </Button>
                    }
                  />
                )}
                {user && (
                  <Button onClick={() => handleLookupAll(pollingCallsigns)} disabled={loading || pollingLoading} size="sm" className="gap-2">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Fetch All from HamQTH
                  </Button>
                )}
              </div>
            </div>
            {pollingLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading polling stations from logs...
              </div>
            ) : (
              renderStationTable([...pollingCallsigns].sort(), 'polling')
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
