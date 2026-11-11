import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { DeviceId } from '../../types';
import { Laptop, Check } from 'lucide-react';

export interface DeviceSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDeviceId: DeviceId;
  onSelectDevice: (id: DeviceId) => void;
}

export const DeviceSetupModal: React.FC<DeviceSetupModalProps> = ({
  isOpen,
  onClose,
  currentDeviceId,
  onSelectDevice,
}) => {
  const devices: { id: DeviceId; name: string; desc: string }[] = [
    {
      id: 'PC-01',
      name: 'Komputer 1 — Gerbang Utama',
      desc: 'Komputer scanner di pintu gerbang utama sekolah.',
    },
    {
      id: 'PC-02',
      name: 'Komputer 2 — Gerbang Barat',
      desc: 'Komputer scanner di pintu samping/barat.',
    },
    {
      id: 'PC-03',
      name: 'Komputer 3 — Ruang Piket',
      desc: 'Komputer di ruang guru/piket untuk koreksi & izin/sakit.',
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Identitas Komputer (Perangkat Ini)"
      description="Pilih identitas fisik komputer ini agar pencatatan transaksi dan batasan akun operator sesuai."
    >
      <div className="space-y-3">
        {devices.map((d) => {
          const isSelected = currentDeviceId === d.id;
          return (
            <div
              key={d.id}
              onClick={() => {
                onSelectDevice(d.id);
                onClose();
              }}
              className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                isSelected
                  ? 'border-2 border-primary-600 bg-primary-50/40 shadow-sm'
                  : 'border-border hover:border-gray-300 hover:bg-gray-50/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${
                    isSelected ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-content-primary">{d.name}</h4>
                  <p className="text-xs text-content-secondary mt-0.5">{d.desc}</p>
                </div>
              </div>
              {isSelected && (
                <div className="w-6 h-6 rounded-full bg-primary-600 text-white flex items-center justify-center">
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
              )}
            </div>
          );
        })}

        <div className="pt-3 border-t border-border flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    </Modal>
  );
};

