import ProcessRequests from '../ProcessRequests';

export default function ProcessRequestsExample() {
  return (
    <div className="space-y-12">
      <div>
        <h2 className="text-xl font-semibold mb-4">Admin View</h2>
        <ProcessRequests isAdmin={true} />
      </div>
      <div>
        <h2 className="text-xl font-semibold mb-4">Employee View</h2>
        <ProcessRequests isAdmin={false} />
      </div>
    </div>
  );
}
