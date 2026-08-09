import { groupChanges } from '../../helpers/group-changes.js';

describe('Group changes helper', () => {
  it('groupChanges should combine replace transactions into one', () => {
    const changes = [
      {
        mark: {
          type: {
            name: 'trackDelete',
          },
          attrs: {
            id: '0',
            author: 'Superdoc User',
            authorEmail: 'undefined',
            date: '2024-12-20T04:20:00Z',
            importedAuthor: 'Superdoc User (imported)',
          },
        },
        from: 46,
        to: 51,
      },
      {
        mark: {
          type: {
            name: 'trackInsert',
          },
          attrs: {
            id: '1',
            author: 'Superdoc User',
            authorEmail: 'undefined',
            date: '2024-12-20T04:20:00Z',
            importedAuthor: 'Superdoc User (imported)',
          },
        },
        from: 52,
        to: 71,
      },
      {
        mark: {
          type: {
            name: 'trackDelete',
          },
          attrs: {
            id: '1',
            author: 'Superdoc User',
            authorEmail: 'undefined',
            date: '2024-12-20T04:20:00Z',
            importedAuthor: 'Superdoc User (imported)',
          },
        },
        from: 71,
        to: 90,
      },
      {
        mark: {
          type: {
            name: 'trackDelete',
          },
          attrs: {
            id: '2',
            author: 'Superdoc User',
            authorEmail: 'undefined',
            date: '2024-12-20T04:30:00Z',
            importedAuthor: 'Superdoc User (imported)',
          },
        },
        from: 143,
        to: 192,
      },
      {
        mark: {
          type: {
            name: 'trackInsert',
          },
          attrs: {
            id: '3',
            author: 'Superdoc User',
            authorEmail: 'undefined',
            date: '2024-12-20T04:30:00Z',
            importedAuthor: 'Superdoc User (imported)',
          },
        },
        from: 192,
        to: 196,
      },
      {
        mark: {
          type: {
            name: 'trackInsert',
          },
          attrs: {
            id: '4',
            author: 'Superdoc User',
            authorEmail: 'undefined',
            date: '2024-12-20T04:40:00Z',
            importedAuthor: 'Superdoc User (imported)',
          },
        },
        from: 196,
        to: 264,
      },
    ];

    const groupedChanges = groupChanges(changes);
    expect(groupedChanges.length).toBe(5);
    expect(groupedChanges[0]).toHaveProperty('deletionMark');
    expect(groupedChanges[0]).not.toHaveProperty('insertedMark');
    expect(groupedChanges[1]).toHaveProperty('insertedMark');
    expect(groupedChanges[1]).toHaveProperty('deletionMark');
    expect(groupedChanges[2]).toHaveProperty('deletionMark');
    expect(groupedChanges[2]).not.toHaveProperty('insertedMark');
  });

  it('does not consume adjacent same-type slices when a replacement pair exists for the same id', () => {
    const replacementId = 'replacement-1';
    const changes = [
      {
        mark: { type: { name: 'trackInsert' }, attrs: { id: replacementId } },
        from: 10,
        to: 14,
      },
      // Interleaving mark from another id mirrors real mark stream ordering.
      {
        mark: { type: { name: 'trackInsert' }, attrs: { id: 'other-id' } },
        from: 14,
        to: 20,
      },
      {
        mark: { type: { name: 'trackInsert' }, attrs: { id: replacementId } },
        from: 14,
        to: 18,
      },
      {
        mark: { type: { name: 'trackDelete' }, attrs: { id: replacementId } },
        from: 18,
        to: 22,
      },
    ];

    const groupedChanges = groupChanges(changes);
    const replacementGroups = groupedChanges.filter((group) => {
      const id =
        group.insertedMark?.mark.attrs.id || group.deletionMark?.mark.attrs.id || group.formatMark?.mark.attrs.id;
      return id === replacementId;
    });

    expect(replacementGroups).toHaveLength(2);
    expect(replacementGroups.some((group) => group.insertedMark && group.deletionMark)).toBe(true);
    expect(
      replacementGroups.some(
        (group) => group.insertedMark && !group.deletionMark && group.insertedMark.mark.type.name === 'trackInsert',
      ),
    ).toBe(true);
  });
});
