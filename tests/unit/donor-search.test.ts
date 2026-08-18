import { BloodType } from '@prisma/client';
import { searchDonorsQuerySchema } from '@validators/donor.validators';
import { prisma } from '@config/database';
import { searchCompatibleDonors } from '@services/donor.service';

jest.mock('@config/database', () => ({
  prisma: {
    donorProfile: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

describe('donor search query', () => {
  it('accepts a blood-type search when no location is provided', () => {
    const result = searchDonorsQuerySchema.safeParse({
      bloodType: BloodType.O_POS,
      city: '',
    });

    expect(result.success).toBe(true);
  });

  it('only searches donors who are available to donate', async () => {
    const findManyMock = jest.spyOn(prisma.donorProfile, 'findMany').mockResolvedValue([]);
    jest.spyOn(prisma.donorProfile, 'count').mockResolvedValue(0);

    await searchCompatibleDonors({
      page: 1,
      limit: 10,
      bloodType: BloodType.O_POS,
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ availableToDonate: true }),
      }),
    );
  });
});
