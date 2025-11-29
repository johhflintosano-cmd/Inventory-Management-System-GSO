import ManageInventory from '../ManageInventory';

export default function ManageInventoryExample() {
  return (
    <div className="space-y-12">
      <div>
        <h2 className="text-xl font-semibold mb-4">Admin View</h2>
        <ManageInventory isAdmin={true} />
      </div>
      <div>
        <h2 className="text-xl font-semibold mb-4">Employee View</h2>
        <ManageInventory isAdmin={false} />
      </div>
    </div>
  );
}
