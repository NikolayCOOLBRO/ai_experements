# Промт
## Задача
Написать бинарный поиск на языке программирование C#. А так же отдельным файлом 3 теста к нему на nUnit.

## Формат ответа
Только код

# AI MODEL
## YandexGTP 5 LITE
```
using System;

namespace BinarySearch
{
    class Program
    {
        static int BinarySearch(int[] array, int target)
        {
            int left = 0;
            int right = array.Length - 1;

            while (left <= right)
            {
                int mid = left + (right - left) / 2;

                if (array[mid] == target)
                {
                    return mid;
                }
                else if (array[mid] < target)
                {
                    left = mid + 1;
                }
                else
                {
                    right = mid - 1;
                }
            }

            return -1;
        }

        static void Main(string[] args)
        {
            int[] array = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 };
            int target = 7;

            int result = BinarySearch(array, target);

            Console.WriteLine(result);
        }
    }
}
```
```
using NUnit.Framework;

namespace BinarySearchTests
{
    [TestFixture]
    public class BinarySearchTests
    {
        [Test]
        public void TestBinarySearch_ArrayWithTarget()
        {
            // Arrange
            int[] array = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 };
            int target = 7;
            int expectedIndex = 6;

            // Act
            int result = Program.BinarySearch(array, target);

            // Assert
            Assert.AreEqual(expectedIndex, result);
        }

        [Test]
        public void TestBinarySearch_ArrayWithoutTarget()
        {
            // Arrange
            int[] array = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 };
            int target = 11;
            int expectedIndex = -1;

            // Act
            int result = Program.BinarySearch(array, target);

            // Assert
            Assert.AreEqual(expectedIndex, result);
        }

        [Test]
        public void TestBinarySearch_EmptyArray()
        {
            // Arrange
            int[] array = { };
            int target = 5;
            int expectedIndex = -1;

            // Act
            int result = Program.BinarySearch(array, target);

            // Assert
            Assert.AreEqual(expectedIndex, result);
        }
    }
}
```

## GPT OSS 20B
using System;

namespace BinarySearchLib
{
    public static class BinarySearch
    {
        public static int Search(int[] array, int target)
        {
            int left = 0;
            int right = array.Length - 1;

            while (left <= right)
            {
                int mid = left + (right - left) / 2;
                if (array[mid] == target) return mid;
                if (array[mid] < target) left = mid + 1;
                else right = mid - 1;
            }

            return -1;
        }
    }
}

// BinarySearchTests.cs
using NUnit.Framework;
using BinarySearchLib;

namespace BinarySearchTests
{
    [TestFixture]
    public class BinarySearchTests
    {
        [Test]
        public void TargetExists_ReturnsIndex()
        {
            int[] array = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 };
            int result = BinarySearch.Search(array, 7);
            Assert.AreEqual(6, result);
        }

        [Test]
        public void TargetDoesNotExist_ReturnsNegativeOne()
        {
            int[] array = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 };
            int result = BinarySearch.Search(array, 11);
            Assert.AreEqual(-1, result);
        }

        [Test]
        public void EmptyArray_ReturnsNegativeOne()
        {
            int[] array = { };
            int result = BinarySearch.Search(array, 5);
            Assert.AreEqual(-1, result);
        }
    }
}


## Deepseek V4 Flash

```
// BinarySearch.cs
using System;

public static class BinarySearch
{
    public static int Search(int[] sortedArray, int target)
    {
        int left = 0;
        int right = sortedArray.Length - 1;

        while (left <= right)
        {
            int mid = left + (right - left) / 2;
            if (sortedArray[mid] == target)
                return mid;
            else if (sortedArray[mid] < target)
                left = mid + 1;
            else
                right = mid - 1;
        }

        return -1;
    }
}
```

```
// BinarySearchTests.cs
using NUnit.Framework;

[TestFixture]
public class BinarySearchTests
{
    [Test]
    public void Search_TargetExists_ReturnsCorrectIndex()
    {
        int[] array = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 };
        int result = BinarySearch.Search(array, 7);
        Assert.AreEqual(6, result);
    }

    [Test]
    public void Search_TargetDoesNotExist_ReturnsNegativeOne()
    {
        int[] array = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 };
        int result = BinarySearch.Search(array, 11);
        Assert.AreEqual(-1, result);
    }

    [Test]
    public void Search_EmptyArray_ReturnsNegativeOne()
    {
        int[] array = { };
        int result = BinarySearch.Search(array, 5);
        Assert.AreEqual(-1, result);
    }
}
```

# Выводы

YandexGTP 5 LITE - больше всех строчек сделала, но написала код, который потенциально можно сразу запустить.

GPT-OSS - написал классический для этого решения код.

Deepseek v4 flash - уже учёл, что входящие значение у нас это отсортированный массив. А так ничем не отличается от GPT-OSS;